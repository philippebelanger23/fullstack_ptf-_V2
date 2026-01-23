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
from market_data import calculate_returns, build_results_dataframe, get_ticker_performance
from cache_manager import load_cache, save_cache
from constants import CASH_TICKER, FX_TICKER
from nav_scraper import NAVScraper

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

class TickerRow(BaseModel):
    ticker: str
    isMutualFund: bool = False

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
                        nav_dict[ticker][datetime.datetime.strptime(d, "%Y-%m-%d")] = v
        except Exception as e:
            logger.warning(f"Failed to load manual_navs.json: {e}")

    # 2. Load scraped NAVs
    scraped_nav_path = Path("data/scraped_navs.json")
    if scraped_nav_path.exists():
        try:
            import json
            import datetime
            with open(scraped_nav_path, "r") as f:
                scraped_navs = json.load(f)
                for ticker, dates_data in scraped_navs.items():
                    if ticker not in nav_dict: nav_dict[ticker] = {}
                    for d, v in dates_data.items():
                        nav_dict[ticker][datetime.datetime.strptime(d, "%Y-%m-%d")] = v
        except Exception as e:
            logger.warning(f"Failed to load scraped_navs.json: {e}")

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
                dt = datetime.strptime(item.date, "%Y-%m-%d")
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
        now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        if latest_date < now:
            dates.append(now)
            # Propagate the latest weights to the 'Today' period
            for ticker in weights_dict:
                if latest_date in weights_dict[ticker]:
                    weights_dict[ticker][now] = weights_dict[ticker][latest_date]
        
        
        # Load all available NAV data
        nav_dict = get_aggregated_nav_data()

        # Identify which tickers are marked as mutual funds in the request
        mutual_fund_tickers = {item.ticker.upper().strip() for item in request.items if item.isMutualFund}

        return run_portfolio_analysis(weights_dict, nav_dict, dates, mutual_fund_tickers)
        
    except Exception as e:
        logger.error(f"Error in manual analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

def run_portfolio_analysis(weights_dict, nav_dict, dates, mutual_fund_tickers=None):
    """Core logic shared between file upload and manual entry."""
    cache = load_cache()
    
    logger.info("Fetching market data...")
    returns, prices = calculate_returns(weights_dict, nav_dict, dates, cache, mutual_fund_tickers)
    
    save_cache(cache)
    
    logger.info("Building results dataframe...")
    df, periods = build_results_dataframe(weights_dict, returns, prices, dates, cache, mutual_fund_tickers)
    
    result_items = []
    
    if df.empty:
        return []
        
    # Iterate through each period to create time-series data for the client
    for i, period in enumerate(periods):
        end_date_ts = period[1]
        date_str = end_date_ts.strftime("%Y-%m-%d")
        
        for _, row in df.iterrows():
            ticker = row['Ticker']
            
            # Extract values for this specific period
            weight = row.get(f'Weight_{i}', 0.0)
            ret = row.get(f'Return_{i}', 0.0)
            contrib = row.get(f'Contrib_{i}', 0.0)
            
            item = PortfolioItem(
                ticker=ticker,
                weight=float(weight),
                date=date_str,
                returnPct=float(ret),
                contribution=float(contrib),
                # Optional fields
                companyName=None,
                sector=None, 
                notes=None
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
                        if val is None: return 0.0
                        try:
                            v = float(val)
                            # Logic:
                            # 1. If v < 0.20 (e.g. 0.0126), it's likely a decimal. Multiply by 100 -> 1.26%
                            # 2. If 0.20 <= v < 20 (e.g. 1.26), it's likely already a percentage. Keep as is -> 1.26%
                            # 3. If v >= 20 (e.g. 126.0), it's likely double-multiplied or a rare high-yield outlier.
                            #    We divide by 100 to be safe, as yields over 20% are extremely rare for standard equities.
                            if v < 0.20:
                                return v * 100.0
                            elif v >= 20.0:
                                return v / 100.0
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


@app.post("/refresh-navs")
async def refresh_navs(request: dict):
    url = request.get("url")
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    try:
        scraper = NAVScraper(storage_path="data/scraped_navs.json")
        success = scraper.update_navs(url)
        return {"success": success, "message": "Scraping complete" if success else "No data extracted"}
    except Exception as e:
        logger.error(f"Error in refresh-navs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

if __name__ == "__main__":
    import uvicorn
    import sys
    import asyncio

    # Fix for Windows asyncio loop policy (prevents "ConnectionResetError" and "ProactorBasePipeTransport" errors)
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
