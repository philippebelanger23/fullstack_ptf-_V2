import shutil
import os
from pathlib import Path
from typing import List, Optional
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

# Import existing logic
from data_loader import load_historic_nav_csvs
from market_data import calculate_returns, build_results_dataframe, get_ticker_performance, needs_fx_adjustment
from cache_manager import load_cache, save_cache
from constants import CASH_TICKER, FX_TICKER

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development (supports network IPs)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define Response Model to match Client's PortfolioItem
class PortfolioItem(BaseModel):
    ticker: str
    weight: float
    date: str
    companyName: Optional[str] = None
    sector: Optional[str] = None
    notes: Optional[str] = None
    returnPct: Optional[float] = None
    contribution: Optional[float] = None
    isMutualFund: Optional[bool] = None  # Flag for mutual funds requiring CSV NAV data
    isEtf: Optional[bool] = None # Flag for ETFs
    sectorWeights: Optional[dict] = None # Custom sector breakdowns percentage (e.g. {"Technology": 10.0})

class TickerRow(BaseModel):
    ticker: str
    isMutualFund: bool = False
    isEtf: bool = False

class AllocationPeriod(BaseModel):
    id: str
    startDate: str
    endDate: str
    weights: dict

class PortfolioConfig(BaseModel):
    tickers: List[TickerRow]
    periods: List[AllocationPeriod]

# --- Helper for NAV Loading ---
def get_aggregated_nav_data():
    """
    Load and aggregate NAV data from all server-side sources:
    1. manual_navs.json
    2. scraped_navs.json
    3. historic_navs/*.csv
    """
    nav_dict = {}
    
    # 1. Load manually provided NAVs
    manual_nav_path = Path("data/manual_navs.json")
    if manual_nav_path.exists():
        try:
            import json
            import datetime
            with open(manual_nav_path, "r") as f:
                static_navs = json.load(f)
                for ticker, dates_data in static_navs.items():
                    if ticker not in nav_dict: nav_dict[ticker] = {}
                    for d, v in dates_data.items():
                        nav_dict[ticker][pd.to_datetime(d)] = v
        except Exception as e:
            logger.warning(f"Failed to load manual_navs.json: {e}")


    # 3. Load historical CSV NAVs
    try:
        csv_navs = load_historic_nav_csvs("data/historic_navs")
        for ticker, dates_data in csv_navs.items():
            if ticker not in nav_dict: nav_dict[ticker] = {}
            nav_dict[ticker].update(dates_data)
    except Exception as e:
        logger.warning(f"Failed to load historical CSV NAVs: {e}")
        
    return nav_dict


class ManualAnalysisRequest(BaseModel):
    items: List[PortfolioItem]

@app.post("/analyze-manual", response_model=List[PortfolioItem])
async def analyze_manual(request: ManualAnalysisRequest):
    try:
        from datetime import datetime
        
        # Convert flat list of items to weights_dict and dates
        weights_dict = {}
        dates_set = set()
        
        for item in request.items:
            ticker = item.ticker.upper().strip()
            if not ticker or 'TICKER' in ticker: 
                continue
                
            try:
                # Handle date parsing (expects YYYY-MM-DD from frontend)
                # Handle date parsing (expects YYYY-MM-DD from frontend)
                dt = pd.to_datetime(item.date)
                dates_set.add(dt)
                
                if ticker not in weights_dict:
                    weights_dict[ticker] = {}
                
                # Handle weight logic (string parsing for %)
                w_val = item.weight
                if isinstance(w_val, str):
                    is_percentage = '%' in w_val
                    # Clean string
                    val_str = w_val.replace('%', '').strip()
                    try:
                        w = float(val_str)
                        if is_percentage:
                            w = w / 100.0
                    except ValueError:
                         logger.warning(f"Invalid weight string: {w_val}")
                         continue
                else:
                    w = float(w_val)
                
                # No more heuristic division. Weights should be passed as they are (percentage values).
                weights_dict[ticker][dt] = w
            except Exception as e:
                logger.warning(f"Skipping invalid item {item}: {e}")
                
        dates = sorted(list(dates_set))
        if not dates:
             raise HTTPException(status_code=400, detail="No valid dates found in data")
        
        # Automatically add 'Today' if the last date is in the past
        # This ensures the Attribution tab shows current data for the latest positions
        latest_date = dates[-1]
        latest_date = dates[-1]
        now = pd.Timestamp.now().normalize()
        if latest_date < now:
            dates.append(now)
            # Propagate the latest weights to the 'Today' period
            for ticker in weights_dict:
                if latest_date in weights_dict[ticker]:
                    weights_dict[ticker][now] = weights_dict[ticker][latest_date]
        
        
        # Load all available NAV data
        nav_dict = get_aggregated_nav_data()

        # Identify which tickers are marked as mutual funds or ETFs in the request
        mutual_fund_tickers = {item.ticker.upper().strip() for item in request.items if item.isMutualFund}
        etf_tickers = {item.ticker.upper().strip() for item in request.items if item.isEtf}

        return run_portfolio_analysis(weights_dict, nav_dict, dates, mutual_fund_tickers, etf_tickers)
        
    except Exception as e:
        logger.error(f"Error in manual analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def run_portfolio_analysis(weights_dict, nav_dict, dates, mutual_fund_tickers=None, etf_tickers=None):
    """Core logic shared between file upload and manual entry."""
    cache = load_cache()
    if mutual_fund_tickers is None: mutual_fund_tickers = set()
    if etf_tickers is None: etf_tickers = set()
    
    logger.info("Fetching market data...")
    returns, prices = calculate_returns(weights_dict, nav_dict, dates, cache, mutual_fund_tickers)
    
    save_cache(cache)
    
    # Load custom sector weights if available
    custom_sectors = {}
    sector_path = Path("data/custom_sectors.json")
    if sector_path.exists():
        try:
            import json
            with open(sector_path, "r") as f:
                custom_sectors = json.load(f)
        except: pass

    logger.info("Building results dataframe...")
    df, periods = build_results_dataframe(weights_dict, returns, prices, dates, cache, mutual_fund_tickers, custom_sectors)
    
    result_items = []
    
    if df.empty:
        return []
        
    # Iterate through each period to create time-series data for the client
    for i, period in enumerate(periods):
        end_date_ts = period[1]
        date_str = end_date_ts.strftime("%Y-%m-%d")
        
        for _, row in df.iterrows():
            ticker = row['Ticker']
            t_upper = ticker.upper().strip()
            
            # Extract values for this specific period
            weight = row.get(f'Weight_{i}', 0.0)
            ret = row.get(f'Return_{i}', 0.0)
            contrib = row.get(f'Contrib_{i}', 0.0)
            
            # Determine if we have custom sector weights
            ticker_custom_sectors = custom_sectors.get(ticker)
            
            item = PortfolioItem(
                ticker=ticker,
                weight=float(weight),
                date=date_str,
                returnPct=float(ret),
                contribution=float(contrib),
                # Optional fields
                companyName=None,
                sector='Mixed' if ticker_custom_sectors else None, 
                notes=None,
                isMutualFund=t_upper in mutual_fund_tickers,
                isEtf=t_upper in etf_tickers,
                sectorWeights=ticker_custom_sectors
            )
            result_items.append(item)
            
    return result_items


@app.post("/fetch-sectors")
async def fetch_sectors(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}
    
    import yfinance as yf
    import json
    
    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    
    # --- Server-Side Persistence ---
    cache_file = Path("data/sectors_cache.json")
    server_cache = {}
    
    # Load existing cache
    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                server_cache = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load sector cache file: {e}")

    # Determine what creates a "miss" (not in server cache)
    missing_on_server = [t for t in unique_tickers if t not in server_cache]
    
    if missing_on_server:
        try:
            # yf.Tickers allows batch processing but getting info is sometimes better individually for reliability
            # or we use the Tickers object.
            # Let's try batch fetching info if possible, but yfinance is tricky with batch info.
            # Actually, iterating is safer for 'info' attribute reliability.
            
            # Optimization: Filter out known non-equity patterns first to save API calls
            # (Though yfinance handles them, it's faster to skip)
            
            # We can use Tickers object for multi-threading
            tickers_obj = yf.Tickers(" ".join(missing_on_server))
            
            for ticker in missing_on_server:
                try:
                    # Accessing info triggers the download
                    info = tickers_obj.tickers[ticker].info
                    sector = info.get('sector')
                    
                    # Check for ETF/Fund indicators if sector is missing
                    if not sector:
                        quote_type = info.get('quoteType', '').upper()
                        if quote_type in ['ETF', 'MUTUALFUND']:
                            sector = 'Mixed'
                    
                    if sector:
                        server_cache[ticker] = sector
                except Exception as e:
                    logger.warning(f"Failed to fetch info for {ticker}: {e}")
            
            # Save updated cache
            try:
                # Ensure directory exists
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w") as f:
                    json.dump(server_cache, f)
            except Exception as e:
                logger.error(f"Failed to save sector cache: {e}")
                
        except Exception as e:
            logger.error(f"Error fetching sectors: {e}")
            # Continue to return what we have
    
    # Return requested sectors from the (now updated) server cache
    return {k: server_cache[k] for k in unique_tickers if k in server_cache}

@app.post("/fetch-performance")
async def fetch_performance(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}
    
    import yfinance as yf
    import datetime
    from dateutil.relativedelta import relativedelta
    
    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    results = {}

    try:
        # Group fetching
        tickers_obj = yf.Tickers(" ".join(unique_tickers))
        
        # Calculate start dates for different periods
        today = datetime.date.today()
        start_date_1y = today - relativedelta(years=1)
        
        # We need roughly 1 year of data to calculate all metrics
        # Fetching a bit more to be safe
        
        for ticker in unique_tickers:
            try:
                # Get historical data
                # period="1y" might miss the exact start day if it's a weekend, so using "2y" or explicit dates is safer
                # but "1y" + "ytd" is usually enough. Let's use max necessary period.
                hist = tickers_obj.tickers[ticker].history(period="1y")
                
                if hist.empty:
                    continue
                
                current_price = hist['Close'].iloc[-1]
                
                def get_pct_change(days_ago=None, months_ago=None, start_year=False):
                    if start_year:
                        start_date = datetime.date(today.year, 1, 1)
                    elif months_ago:
                        start_date = today - relativedelta(months=months_ago)
                    else:
                        return 0.0 # Should not happen
                        
                    # Find closest date in history (backwards)
                    # Use tz-naive comparison if needed
                    hist_dates = hist.index.date
                    
                    # Find finding the closest date <= start_date
                    # This is a bit rough, but sufficient for dashboard
                    
                    # Filter history to only include dates <= start_date
                    # But actually we want the price AT start_date. 
                    # If start_date is today, change is 0.
                    # If start_date was weekend, we want Friday before.
                    
                    # Simplification: Get row closest to start_date
                    # We can search in the index
                    
                    # Convert index to dates
                    # Index is usually datetime, let's treat as date
                    
                    target_idx = hist.index[hist.index.date <= start_date]
                    if target_idx.empty:
                        # If we don't have history going back that far (e.g. valid YTD but not 1Y)
                        # Try to use the first available point? Or return None?
                        # Let's return None to indicate no data for period
                        if start_year: # YTD should usually exist if recent
                             return (current_price - hist['Close'].iloc[0]) / hist['Close'].iloc[0]
                        return None

                    start_price = hist.loc[target_idx[-1]]['Close']
                    return (current_price - start_price) / start_price

                # Metrics
                # YTD
                ytd_start = datetime.date(today.year, 1, 1)
                # If today is Jan 1st?
                
                perf = {}
                
                # YTD
                # Use history(period="ytd") is easiest for YTD specifically but we already fetched 1y
                # Let's just calculate manually to batch fewer calls
                
                idx_ytd = hist.index[hist.index.date < today] # All past settings
                # Actually, YTD is from Dec 31 prev year or Jan 1 current year.
                # Let's use get_pct_change with start_year=True
                perf['YTD'] = get_pct_change(start_year=True)
                perf['1Y'] = get_pct_change(months_ago=12) # Might fail if history < 1y
                perf['6M'] = get_pct_change(months_ago=6)
                perf['3M'] = get_pct_change(months_ago=3)
                
                results[ticker] = perf
                
            except Exception as e:
                logger.warning(f"Failed to fetch performance for {ticker}: {e}")
                
        return results
        
    except Exception as e:
        logger.error(f"Error fetching performance: {e}")
        return {}

@app.get("/index-exposure")
async def get_index_exposure():
    try:
        import json
        # Try absolute path if relative fails
        data_path = Path("data/index_exposure.json")
        if not data_path.exists():
            # Try exploring parent or common locations if needed, but for now let's just log
            logger.warning(f"Relative path {data_path} not found, checking absolute...")
            data_path = Path(__file__).parent / "data" / "index_exposure.json"
            
        if not data_path.exists():
            logger.error(f"index_exposure.json not found even at {data_path}")
            return {"sectors": [], "geography": [], "last_updated": ""}
            
        with open(data_path, "r") as f:
            raw_data = json.load(f)
            
        acwi = raw_data.get("ACWI", {})
        tsx = raw_data.get("TSX", {})
        
        # --- Sector Composition ---
        all_sectors = set(acwi.get("Sectors", {}).keys()) | set(tsx.get("Sectors", {}).keys())
        
        sector_list = []
        for sector in all_sectors:
            w_acwi = acwi.get("Sectors", {}).get(sector, 0.0)
            w_tsx = tsx.get("Sectors", {}).get(sector, 0.0)
            
            w_composite = (w_acwi * 0.75) + (w_tsx * 0.25)
            
            if w_composite > 0.01:
                sector_list.append({
                    "sector": sector,
                    "ACWI": w_acwi,
                    "TSX": w_tsx,
                    "Index": round(w_composite, 2)
                })
            
        sector_list.sort(key=lambda x: x["Index"], reverse=True)
        
        # --- Geography Composition ---
        all_regions = set(acwi.get("Geography", {}).keys()) | set(tsx.get("Geography", {}).keys())
        
        geo_list = []
        for region in all_regions:
            w_acwi = acwi.get("Geography", {}).get(region, 0.0)
            w_tsx = tsx.get("Geography", {}).get(region, 0.0)
            
            w_composite = (w_acwi * 0.75) + (w_tsx * 0.25)
            
            if w_composite > 0.01:
                geo_list.append({
                    "region": region,
                    "weight": round(w_composite, 2)
                })
                
        geo_list.sort(key=lambda x: x["weight"], reverse=True)
        
        # Extract date from scraped data if available
        scraped_date = acwi.get("as_of_date", "")
        if not scraped_date:
            scraped_date = raw_data.get("scraped_at", "")[:10] # Fallback to scrape time

        return {
            "sectors": sector_list,
            "geography": geo_list,
            "last_scraped": scraped_date,
            "raw": {
                "ACWI": {"Geography": acwi.get("Geography", {})},
                "TSX": {"Geography": tsx.get("Geography", {})}
            }
        }
    except Exception as e:
        logger.error(f"Error in index-exposure: {e}")
        return {"sectors": [], "geography": []}

@app.post("/currency-performance")
async def currency_performance(request: dict):
    from cache_manager import load_cache, save_cache
    
    tickers = request.get("tickers", [])
    if not tickers:
        return {}
        
    try:
        cache = load_cache()
        performance = get_ticker_performance(tickers, cache)
        save_cache(cache)
        return performance
    except Exception as e:
        logger.error(f"Error in currency-performance: {e}")
        return {}



@app.post("/fetch-betas")
async def fetch_betas(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}
    
    import yfinance as yf
    import json
    
    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    results = {}
    
    # --- Server-Side Persistence for Betas ---
    cache_file = Path("data/betas_cache.json")
    server_cache = {}
    
    # Load existing cache
    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                server_cache = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load beta cache file: {e}")
    
    # Heuristic for obvious funds/ETFs where we want Beta = 1.0 immediately without fetching
    to_fetch = []
    
    for ticker in unique_tickers:
        # Check server cache first
        if ticker in server_cache:
            results[ticker] = server_cache[ticker]
            continue
            
        t_upper = ticker.upper()
        # Heuristics for Funds/ETFs to default to 1.0
        if (t_upper.startswith('TDB') or 
            t_upper.startswith('DYN') or 
            (t_upper.startswith('X') and t_upper.endswith('.TO')) or
            (t_upper.startswith('V') and t_upper.endswith('.TO')) or
            (t_upper.startswith('Z') and t_upper.endswith('.TO')) or
            (t_upper.startswith('H') and t_upper.endswith('.TO')) or 
            'CASH' in t_upper or 
            '$' in t_upper):
            results[ticker] = 1.0
            server_cache[ticker] = 1.0  # Cache heuristic values too
        else:
            to_fetch.append(ticker)
    
    # Only fetch tickers not in cache
    if to_fetch:
        try:
            tickers_obj = yf.Tickers(" ".join(to_fetch))
            
            for ticker in to_fetch:
                try:
                    found_ticker = tickers_obj.tickers.get(ticker)
                    if not found_ticker:
                        found_ticker = yf.Ticker(ticker)
                        
                    # beta is in info
                    info = found_ticker.info
                    
                    quote_type = info.get('quoteType', '').upper()
                    if quote_type in ['ETF', 'MUTUALFUND']:
                        beta_value = 1.0
                    else:
                        beta = info.get('beta')
                        beta_value = beta if beta is not None else 1.0
                    
                    results[ticker] = beta_value
                    server_cache[ticker] = beta_value  # Cache the result
                            
                except Exception as e:
                    logger.warning(f"Failed to fetch beta for {ticker}: {e}")
                    results[ticker] = 1.0
                    server_cache[ticker] = 1.0
                    
        except Exception as e:
            logger.error(f"Error fetching betas: {e}")
    
    # Save updated cache
    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(server_cache, f)
    except Exception as e:
        logger.error(f"Failed to save beta cache: {e}")
            
    return results

@app.post("/fetch-dividends")
async def fetch_dividends(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}
    
    import yfinance as yf
    import json
    
    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    results = {}
    
    # --- Server-Side Persistence for Dividend Yields ---
    cache_file = Path("data/dividends_cache.json")
    server_cache = {}
    
    # Load existing cache
    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                server_cache = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load dividend cache file: {e}")
    
    # Filter tickers not in cache
    to_fetch = []
    
    for ticker in unique_tickers:
        # Check server cache first
        if ticker in server_cache:
            results[ticker] = server_cache[ticker]
            continue
            
        t_upper = ticker.upper()
        # Cash has 0% dividend yield
        if 'CASH' in t_upper or '$' in t_upper:
            results[ticker] = 0.0
            server_cache[ticker] = 0.0
        else:
            to_fetch.append(ticker)
    
    # Fetch tickers not in cache
    if to_fetch:
        try:
            tickers_obj = yf.Tickers(" ".join(to_fetch))
            
            for ticker in to_fetch:
                try:
                    found_ticker = tickers_obj.tickers.get(ticker)
                    if not found_ticker:
                        found_ticker = yf.Ticker(ticker)
                        
                    info = found_ticker.info
                    
                    def normalize_yield(val):
                        """
                        Normalize dividend yield to percentage format.
                        
                        yfinance typically returns yield as a decimal (0.0126 = 1.26%).
                        However, we need to handle edge cases:
                        - 0.0126 -> 1.26% (multiply by 100)
                        - 1.26 -> 1.26% (already percentage, keep as is)
                        - 126.0 -> 1.26% (over-multiplied, divide by 100)
                        
                        Key insight: Real dividend yields rarely exceed 15% for normal equities.
                        High-yield REITs/MLPs may reach 15%, but 20%+ is extremely rare.
                        """
                        if val is None: 
                            return 0.0
                        try:
                            v = float(val)
                            if v < 0:
                                return 0.0  # Invalid negative yield
                            
                            # yfinance returns decimals where values < 1 represent the yield
                            # e.g., 0.0126 = 1.26%
                            if v < 1.0:
                                # This is definitely a decimal - multiply to get percentage
                                return v * 100.0
                            elif v > 50.0:
                                # This is almost certainly over-multiplied (no stock yields 50%+)
                                # Could be 5000 (meaning 50%) - divide by 100
                                return v / 100.0
                            else:
                                # Value is between 1.0 and 50.0 - assume it's already a percentage
                                # This handles both high-yield edge cases (10-15%) and
                                # already-converted values
                                return v
                        except:
                            return 0.0

                    div_yield_pct = normalize_yield(info.get('dividendYield'))
                    if div_yield_pct == 0:
                        div_yield_pct = normalize_yield(info.get('trailingAnnualDividendYield'))
                    
                    results[ticker] = div_yield_pct
                    server_cache[ticker] = div_yield_pct
                            
                except Exception as e:
                    logger.warning(f"Failed to fetch dividend for {ticker}: {e}")
                    results[ticker] = 0.0
                    server_cache[ticker] = 0.0
                    
        except Exception as e:
            logger.error(f"Error fetching dividends: {e}")
    
    # Save updated cache
    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(server_cache, f)
    except Exception as e:
        logger.error(f"Failed to save dividend cache: {e}")
            
    return results

@app.get("/index-history")
async def get_index_history():
    """
    Fetch historical data for ACWI (global) and XIU.TO (Canada) for the comparison graph.
    Also fetches USDCAD=X to convert ACWI to CAD, and calculates a synthetic blend (75% ACWI, 25% XIU).
    Caches the result to avoid repeated slow yfinance calls.
    """
    import yfinance as yf
    import json
    import datetime
    
    cache_file = Path("data/index_history_cache.json")
    
    # Check cache freshness (e.g., 24 hours)
    if cache_file.exists():
        try:
            # Check modification time
            mtime = datetime.datetime.fromtimestamp(cache_file.stat().st_mtime)
            if datetime.datetime.now() - mtime < datetime.timedelta(hours=24):
                with open(cache_file, "r") as f:
                    logger.info("Serving index history from cache")
                    return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read index history cache: {e}")

    # Fetch new data
    logger.info("Fetching fresh index history from yfinance...")
    tickers = ["ACWI", "XIU.TO", "USDCAD=X"]
    
    try:
        # Fetch 5 years of data
        # auto_adjust=True might be better for total return (dividends), but standard close is okay for simple price
        data = yf.download(tickers, period="5y", interval="1d", progress=False)
        
        if data.empty:
            return {"ACWI": [], "XIU.TO": [], "Index": []}
            
        # Get Close prices
        # Handle potential multi-index or single index
        # If all tickers found, it's multi-index 'Close' -> [ACWI, XIU.TO, USDCAD=X]
        if 'Close' in data.columns:
            closes = data['Close']
        else:
            # Fallback if structure is different (sometimes yfinance changes)
            closes = data
        
        # Ensure we have all columns
        expected_cols = ["ACWI", "XIU.TO", "USDCAD=X"]
        # Filter for existing columns
        existing_cols = [c for c in expected_cols if c in closes.columns]
        
        if not existing_cols:
             return {"ACWI": [], "XIU.TO": [], "Index": []}

        # Fill missing values (holidays etc)
        closes = closes[existing_cols].ffill().bfill()
        
        result_data = {
            "ACWI": [],
            "XIU.TO": [],
            "Index": []
        }
        
        dates = closes.index.strftime('%Y-%m-%d').tolist()
        
        # Use pandas vectorized operations for calculation
        # Handle missing columns gracefully if only partial success
        if "ACWI" in closes.columns and "USDCAD=X" in closes.columns:
            acwi_cad_series = closes["ACWI"] * closes["USDCAD=X"]
        else:
            acwi_cad_series = pd.Series(dtype=float)
            
        if "XIU.TO" in closes.columns:
            xiu_series = closes["XIU.TO"]
        else:
            xiu_series = pd.Series(dtype=float)
            
        # Calculate Composite Index (Total Return approx)
        # We use daily returns to build the index starting at 100
        if not acwi_cad_series.empty and not xiu_series.empty:
            acwi_ret = acwi_cad_series.pct_change().fillna(0)
            xiu_ret = xiu_series.pct_change().fillna(0)
            
            # Synthetic 75/25
            composite_ret = (acwi_ret * 0.75) + (xiu_ret * 0.25)
            composite_index = (1 + composite_ret).cumprod() * 100
        else:
            composite_index = pd.Series(dtype=float)
        
        # Prepare final lists
        acwi_list = acwi_cad_series.tolist() if not acwi_cad_series.empty else []
        xiu_list = xiu_series.tolist() if not xiu_series.empty else []
        comp_list = composite_index.tolist() if not composite_index.empty else []
        
        for i, date_str in enumerate(dates):
             # ACWI (in CAD)
             if i < len(acwi_list) and pd.notna(acwi_list[i]):
                 result_data["ACWI"].append({"date": date_str, "value": acwi_list[i]})
                 
             # XIU
             if i < len(xiu_list) and pd.notna(xiu_list[i]):
                 result_data["XIU.TO"].append({"date": date_str, "value": xiu_list[i]})
                 
             # Composite
             if i < len(comp_list) and pd.notna(comp_list[i]):
                 result_data["Index"].append({"date": date_str, "value": comp_list[i]})

        # Save to cache
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w") as f:
                json.dump(result_data, f)
        except Exception as e:
            logger.error(f"Failed to write index history cache: {e}")
            
        return result_data

    except Exception as e:
        logger.error(f"Error fetching index history: {e}")
        return {"ACWI": [], "XIU.TO": [], "Index": []}


# Removed refresh-navs endpoint as scraping is no longer supported.

@app.post("/save-portfolio-config")
async def save_portfolio_config(config: PortfolioConfig):
    import json
    try:
        config_path = Path("data/portfolio_config.json")
        config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(config.dict(), f)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving portfolio config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/load-portfolio-config")
async def load_portfolio_config():
    import json
    try:
        config_path = Path("data/portfolio_config.json")
        if not config_path.exists():
            return {"tickers": [], "periods": []}
        with open(config_path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading portfolio config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/save-sector-weights")
async def save_sector_weights(request: dict):
    """Save custom sector weight breakdowns (e.g. for ETFs/MFs)"""
    import json
    try:
        weights = request.get("weights", {})
        path = Path("data/custom_sectors.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(weights, f)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving sector weights: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/load-sector-weights")
async def load_sector_weights():
    import json
    try:
        path = Path("data/custom_sectors.json")
        if not path.exists():
            return {}
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading sector weights: {e}")
        return {}

@app.post("/save-asset-geo")
async def save_asset_geo(request: dict):
    """Save custom geographical classifications (e.g. CA, US, INTL)"""
    import json
    try:
        geo = request.get("geo", {})
        path = Path("data/custom_geography.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(geo, f)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving asset geography: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/load-asset-geo")
async def load_asset_geo():
    import json
    try:
        path = Path("data/custom_geography.json")
        if not path.exists():
            return {}
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading asset geography: {e}")
        return {}

@app.post("/check-nav-lag")
async def check_nav_lag(request: dict):
    """
    Compare last NAV date on file with last yfinance date for a set of tickers.
    If NAV date is behind yfinance (usually > 1-2 days lag), flag it.
    
    Args:
        request.tickers: List of ticker symbols to check
        request.force_refresh: If true, ignore internal caches
    """
    import yfinance as yf
    import datetime
    from pathlib import Path
    import pandas as pd
    
    tickers = request.get("tickers", [])
    force_refresh = request.get("force_refresh", False)
    reference_date_str = request.get("reference_date")
    
    if not tickers:
        return {}
    
    results = {}
    
    # 1. Load freshest NAV data (always from disk)
    nav_data = get_aggregated_nav_data()
    logger.info(f"check-nav-lag: Started check for {len(tickers)} tickers. force_refresh={force_refresh}, ref_date={reference_date_str}")
    
    # Helper to get last business day (skip weekends)
    def get_last_business_day(reference_date=None):
        if reference_date is None:
            # Use current date but zero out time for clean comparison
            reference_date = datetime.datetime.now().date()
        
        # If today is Saturday (5) or Sunday (6), go back to Friday
        while reference_date.weekday() >= 5:
            reference_date -= datetime.timedelta(days=1)
        return reference_date

    # 2. Get global market threshold
    if reference_date_str:
        try:
            last_market_date = datetime.datetime.strptime(reference_date_str, "%Y-%m-%d").date()
            # Adjust to business day if the provided date is a weekend
            last_market_date = get_last_business_day(last_market_date)
            logger.info(f"check-nav-lag: Using provided reference date: {last_market_date}")
        except Exception as e:
            logger.warning(f"Invalid reference_date {reference_date_str}, falling back to today. Error: {e}")
            last_market_date = get_last_business_day()
    else:
        # We use SPY as the gold standard for North American trading calendar
        try:
            # yf.download is often more reliable for "fresh" data than Ticker history
            # We fetch 5 days to ensure we find the last actual close even after long holidays
            spy_hist = yf.download("SPY", period="5d", progress=False, threads=False)
            
            if not spy_hist.empty:
                last_market_date = spy_hist.index[-1].date()
                logger.info(f"check-nav-lag: Latest market date from SPY: {last_market_date}")
            else:
                raise ValueError("SPY history empty")
        except Exception as market_err:
            logger.warning(f"check-nav-lag: Failed to fetch market date ({market_err}). Falling back to business day logic.")
            last_market_date = get_last_business_day()

    # Define thresholds
    # NAVs are typically published end-of-day. 
    # If today is Monday, we expect Friday's NAV (yesterday's business day).
    # If it's earlier than Friday, it's lagging.
    last_bday = get_last_business_day(last_market_date)
    # The threshold for "Lagging" is if data is older than the PREVIOUS business day
    # (Allowing 1 business day for publication lag)
    threshold_date = get_last_business_day(last_bday - datetime.timedelta(days=1))
    
    for ticker in tickers:
        try:
            ticker = ticker.upper().strip()
            
            # 1. Get last available NAV date
            ticker_navs = nav_data.get(ticker, {})
            if not ticker_navs:
                results[ticker] = {
                    "lagging": True, 
                    "reason": "Missing Data",
                    "last_nav": None,
                    "last_market": last_market_date.strftime("%Y-%m-%d"),
                    "threshold_date": threshold_date.strftime("%Y-%m-%d"),
                    "days_diff": 999
                }
                continue
            
            # Keys are datetime or Timestamps
            last_nav_dt = max(ticker_navs.keys())
            # Convert to date for comparison
            if hasattr(last_nav_dt, 'date'):
                last_nav_date = last_nav_dt.date()
            else:
                last_nav_date = last_nav_dt
            
            # 2. Determine lag
            # Lagging if last NAV is older than the threshold (prev business day)
            is_lagging = last_nav_date < threshold_date
            days_diff = (last_market_date - last_nav_date).days
            
            results[ticker] = {
                "lagging": is_lagging,
                "last_nav": last_nav_date.strftime("%Y-%m-%d"),
                "last_market": last_market_date.strftime("%Y-%m-%d"),
                "days_diff": days_diff,
                "threshold_date": threshold_date.strftime("%Y-%m-%d"),
                "is_stale": is_lagging
            }
            
            if is_lagging:
                logger.info(f"check-nav-lag: {ticker} is LAGGING. Last NAV: {last_nav_date}, Market: {last_market_date}")
            
        except Exception as e:
            logger.error(f"check-nav-lag: Error checking {ticker}: {e}")
            results[ticker] = {"lagging": False, "error": str(e)}
            
    return results

@app.post("/upload-nav/{ticker}")
async def upload_nav(ticker: str, file: UploadFile = File(...)):
    """Upload a CSV NAV file for a specific mutual fund ticker."""
    try:
        ticker = ticker.upper()
        # Create directory if not exists
        path = Path("data/historic_navs")
        path.mkdir(parents=True, exist_ok=True)
        
        file_path = path / f"{ticker}.csv"
        
        # Save the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        logger.info(f"Successfully uploaded NAV CSV for {ticker}")
        return {"success": True, "ticker": ticker}
    except Exception as e:
        logger.error(f"Error uploading NAV for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class BackcastRequest(BaseModel):
    items: List[PortfolioItem]

@app.post("/portfolio-backcast")
async def portfolio_backcast(request: BackcastRequest):
    """
    Backcast the portfolio: given current weights, calculate daily returns over the past year.
    Compare to a benchmark (75% ACWI / 25% XIU.TO blend).
    Returns:
      - Daily cumulative performance series for Portfolio & Benchmark
      - Risk metrics: Sharpe, Volatility, Beta, Max Drawdown, Alpha, Total Return
    """
    import yfinance as yf
    import numpy as np
    from datetime import datetime, timedelta
    import json
    
    items = request.items
    if not items:
        return {"error": "No portfolio items provided"}
    
    # --- 1. Aggregate weights by ticker (get current weights) ---
    # Use the most recent period's weights
    weights_by_ticker: dict[str, float] = {}
    mutual_fund_tickers: set[str] = set()  # Track mutual funds for FX logic
    for item in items:
        ticker = item.ticker.upper().strip()
        if not ticker or 'TICKER' in ticker or 'CASH' in ticker.upper():
            continue
        w = item.weight / 100.0 if item.weight > 1 else item.weight  # Normalize to decimal
        if ticker in weights_by_ticker:
            weights_by_ticker[ticker] = max(weights_by_ticker[ticker], w)  # Take max weight if duplicates
        else:
            weights_by_ticker[ticker] = w
        # Track mutual funds
        if getattr(item, 'isMutualFund', False):
            mutual_fund_tickers.add(ticker)

    
    if not weights_by_ticker:
        return {"error": "No valid tickers found"}
    
    # Normalize weights to sum to 1
    total_weight = sum(weights_by_ticker.values())
    if total_weight > 0:
        weights_by_ticker = {k: v / total_weight for k, v in weights_by_ticker.items()}
    
    # --- 2. Fetch 1 year of daily prices for all tickers ---
    all_tickers = list(weights_by_ticker.keys())
    benchmark_tickers = ["ACWI", "XIU.TO", "USDCAD=X"]
    fetch_list = list(set(all_tickers + benchmark_tickers))
    
    try:
        data = yf.download(fetch_list, period="1y", interval="1d", progress=False)
        if data.empty:
            return {"error": "Failed to fetch price data"}
        
        closes = data['Close'] if 'Close' in data.columns else data
        closes = closes.ffill().bfill()
    except Exception as e:
        logger.error(f"Error downloading prices: {e}")
        return {"error": str(e)}
    
    # --- 3. Calculate daily returns ---
    returns_df = closes.pct_change().fillna(0)
    
    # --- 4. Build portfolio daily returns ---
    # For each ticker, weight * return
    portfolio_returns = pd.Series(0.0, index=returns_df.index)
    missing_tickers = []
    
    for ticker, weight in weights_by_ticker.items():
        if ticker in returns_df.columns:
            # Apply FX adjustment using centralized logic (consistent with Attribution view)
            is_mf = ticker in mutual_fund_tickers
            if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in returns_df.columns:
                fx_ret = returns_df["USDCAD=X"]
                ticker_ret = (1 + returns_df[ticker]) * (1 + fx_ret) - 1
            else:
                ticker_ret = returns_df[ticker]
            portfolio_returns += weight * ticker_ret
        else:
            missing_tickers.append(ticker)
    
    # --- 5. Build benchmark daily returns (75% ACWI in CAD + 25% XIU) ---
    benchmark_returns = pd.Series(0.0, index=returns_df.index)
    if "ACWI" in returns_df.columns and "XIU.TO" in returns_df.columns and "USDCAD=X" in returns_df.columns:
        acwi_cad_ret = (1 + returns_df["ACWI"]) * (1 + returns_df["USDCAD=X"]) - 1
        benchmark_returns = 0.75 * acwi_cad_ret + 0.25 * returns_df["XIU.TO"]
    
    # --- 6. Calculate cumulative performance (indexed to 100) ---
    portfolio_cumulative = (1 + portfolio_returns).cumprod() * 100
    benchmark_cumulative = (1 + benchmark_returns).cumprod() * 100
    
    # --- 7. Calculate risk metrics ---
    # Use valid data only (skip first row since pct_change produces NaN)
    ptf_rets = portfolio_returns.iloc[1:].values
    bmk_rets = benchmark_returns.iloc[1:].values
    
    # Sharpe Ratio (annualized, assuming 0% risk-free rate for simplicity)
    mean_daily_ret = np.mean(ptf_rets)
    std_daily_ret = np.std(ptf_rets)
    sharpe_ratio = (mean_daily_ret / std_daily_ret) * np.sqrt(252) if std_daily_ret > 0 else 0.0
    
    # Sortino Ratio (uses downside deviation instead of total std dev)
    negative_rets = ptf_rets[ptf_rets < 0]
    downside_std = np.std(negative_rets) if len(negative_rets) > 0 else std_daily_ret
    sortino_ratio = (mean_daily_ret / downside_std) * np.sqrt(252) if downside_std > 0 else 0.0
    
    # Volatility (annualized)
    volatility = std_daily_ret * np.sqrt(252)
    
    # Beta
    if np.var(bmk_rets) > 0:
        beta = np.cov(ptf_rets, bmk_rets)[0, 1] / np.var(bmk_rets)
    else:
        beta = 1.0
    
    # Max Drawdown - Portfolio
    cumulative_series = (1 + portfolio_returns).cumprod()
    running_max = cumulative_series.cummax()
    drawdown = (cumulative_series - running_max) / running_max
    max_drawdown = drawdown.min()
    
    # Max Drawdown - Benchmark
    bmk_cumulative_series = (1 + benchmark_returns).cumprod()
    bmk_running_max = bmk_cumulative_series.cummax()
    bmk_drawdown = (bmk_cumulative_series - bmk_running_max) / bmk_running_max
    benchmark_max_drawdown = bmk_drawdown.min()
    
    # Total Return
    total_return = (portfolio_cumulative.iloc[-1] / 100) - 1  # As decimal
    benchmark_total_return = (benchmark_cumulative.iloc[-1] / 100) - 1
    
    # Alpha (simplified: portfolio annualized - benchmark annualized)
    years_elapsed = len(ptf_rets) / 252
    if years_elapsed > 0:
        ptf_annualized = (1 + total_return) ** (1 / years_elapsed) - 1
        bmk_annualized = (1 + benchmark_total_return) ** (1 / years_elapsed) - 1
        alpha = ptf_annualized - bmk_annualized
    else:
        alpha = 0.0
    
    # Benchmark metrics
    bmk_std = np.std(bmk_rets)
    benchmark_volatility = bmk_std * np.sqrt(252)
    benchmark_sharpe = (np.mean(bmk_rets) / bmk_std) * np.sqrt(252) if bmk_std > 0 else 0.0
    
    # Benchmark Sortino
    bmk_negative_rets = bmk_rets[bmk_rets < 0]
    bmk_downside_std = np.std(bmk_negative_rets) if len(bmk_negative_rets) > 0 else bmk_std
    benchmark_sortino = (np.mean(bmk_rets) / bmk_downside_std) * np.sqrt(252) if bmk_downside_std > 0 else 0.0
    
    # Information Ratio = (Portfolio Return - Benchmark Return) / Tracking Error
    # Tracking Error = Std Dev of excess returns (portfolio - benchmark)
    excess_rets = ptf_rets - bmk_rets
    tracking_error = np.std(excess_rets) * np.sqrt(252)  # Annualized
    mean_excess_ret = np.mean(excess_rets) * 252  # Annualized
    information_ratio = mean_excess_ret / tracking_error if tracking_error > 0 else 0.0
    
    # --- 8. Build performance series for chart ---
    dates = portfolio_cumulative.index.strftime('%Y-%m-%d').tolist()
    portfolio_values = portfolio_cumulative.tolist()
    benchmark_values = benchmark_cumulative.tolist()
    
    performance_series = []
    for i, date_str in enumerate(dates):
        if pd.notna(portfolio_values[i]) and pd.notna(benchmark_values[i]):
            performance_series.append({
                "date": date_str,
                "portfolio": portfolio_values[i],
                "benchmark": benchmark_values[i]
            })
    
    return {
        "metrics": {
            "totalReturn": round(total_return * 100, 2),  # As percentage
            "benchmarkReturn": round(benchmark_total_return * 100, 2),
            "alpha": round(alpha * 100, 2),
            "sharpeRatio": round(sharpe_ratio, 2),
            "sortinoRatio": round(sortino_ratio, 2),
            "informationRatio": round(information_ratio, 2),
            "trackingError": round(tracking_error * 100, 2),
            "volatility": round(volatility * 100, 2),
            "beta": round(beta, 2),
            "maxDrawdown": round(max_drawdown * 100, 2),
            "benchmarkMaxDrawdown": round(benchmark_max_drawdown * 100, 2),
            "benchmarkVolatility": round(benchmark_volatility * 100, 2),
            "benchmarkSharpe": round(benchmark_sharpe, 2),
            "benchmarkSortino": round(benchmark_sortino, 2),
        },
        "series": performance_series,
        "missingTickers": missing_tickers
    }


if __name__ == "__main__":
    import uvicorn
    import sys
    import asyncio

    # Fix for Windows asyncio loop policy (prevents "ConnectionResetError" and "ProactorBasePipeTransport" errors)
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
