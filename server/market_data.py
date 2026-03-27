"""Market data fetching and return calculations."""

import logging
import pandas as pd
import yfinance as yf
from constants import CASH_TICKER, FX_TICKER, INDICES
from cache_manager import load_cache, save_cache

logger = logging.getLogger(__name__)


def needs_fx_adjustment(ticker: str, is_mutual_fund: bool = False, nav_dict: dict = None) -> bool:
    """
    Determine if ticker needs USD->CAD FX conversion.
    
    Args:
        ticker: The ticker symbol
        is_mutual_fund: Whether this is a mutual fund (NAV data already in CAD)
        nav_dict: Dictionary of NAV data (tickers present here are CAD-denominated)
    
    Returns:
        True if USD->CAD adjustment needed, False otherwise
    """
    if nav_dict is None:
        nav_dict = {}
    
    # Cash doesn't need FX
    if ticker == CASH_TICKER:
        return False
    
    # Mutual funds use NAV data directly without FX adjustment
    if is_mutual_fund or ticker in nav_dict:
        return False
    
    # Canadian-listed securities (ending in .TO or TSX index)
    if ticker.endswith('.TO') or ticker == "^GSPTSE":
        return False
    
    # Default: US-listed securities need FX adjustment
    return True



def get_price_on_date(ticker, date, cache):
    """Get price for a ticker on a specific date, using cache if available."""
    cache_key = f"{ticker}_{date.strftime('%Y-%m-%d')}"
    
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        start_date = date - pd.Timedelta(days=10)
        data = yf.download(ticker, start=start_date, end=date + pd.Timedelta(days=1),
                           progress=False, auto_adjust=True)

        if data.empty:
            raise ValueError(f"No data available for {ticker} on {date}")

        # Handle multi-level column index from yfinance
        if isinstance(data.columns, pd.MultiIndex):
            close_price = data['Close'][ticker]
        else:
            close_price = data['Close']

        price = float(close_price.iloc[-1])
        cache[cache_key] = price
        return price
    except Exception as e:
        logger.warning(f"Error fetching price for {ticker} on {date}: {str(e)}. Returning None.")
        return None


def get_fx_return(start_date, end_date, cache):
    """Get FX return for CAD=X over the period."""
    fx_start = get_price_on_date(FX_TICKER, start_date, cache)
    fx_end = get_price_on_date(FX_TICKER, end_date, cache)
    if fx_start is None or fx_end is None or fx_start == 0:
        return 0.0
    return (fx_end / fx_start) - 1


def calculate_returns(weights_dict, nav_dict, dates, cache, mutual_fund_tickers=None):
    """Calculate returns for all holdings across all periods."""
    if mutual_fund_tickers is None:
        mutual_fund_tickers = set()
    all_tickers = set(weights_dict.keys())
    all_tickers = sorted(all_tickers)
    
    prices = {}
    returns = {}
    
    for ticker in all_tickers:
        if ticker == CASH_TICKER:
            continue
        
        prices[ticker] = {}
        for date_val in dates:
            # Ensure date_val is a Timestamp for consistency
            date_val = pd.to_datetime(date_val)
            
            # Check if ticker is in nav_dict (manual or CSV loaded)
            if ticker in nav_dict:
                # Try exact match first
                if date_val in nav_dict[ticker]:
                    prices[ticker][date_val] = nav_dict[ticker][date_val]
                else:
                    # Fallback: Find the most recent previous date
                    # This handles weekends/holidays where CSV data might be missing the exact date
                    available_dates = sorted([d for d in nav_dict[ticker].keys() if d <= date_val])
                    
                    if available_dates:
                        last_date = available_dates[-1]
                        prices[ticker][date_val] = nav_dict[ticker][last_date]
                    else:
                        logger.warning(f"No NAV data available for {ticker} on or before {date_val}. Marking as None.")
                        prices[ticker][date_val] = None
            else:
                # Standard Yahoo Finance lookup
                prices[ticker][date_val] = get_price_on_date(ticker, date_val, cache)

    
    for ticker in all_tickers:
        if ticker == CASH_TICKER:
            returns[ticker] = {}
            for i in range(len(dates) - 1):
                start_date = pd.to_datetime(dates[i])
                end_date = pd.to_datetime(dates[i+1])
                returns[ticker][(start_date, end_date)] = 0.0
            continue

        returns[ticker] = {}
        for i in range(len(dates) - 1):
            start_date = pd.to_datetime(dates[i])
            end_date = pd.to_datetime(dates[i+1])
            
            # Check if we have valid price data for both dates
            if ticker not in prices or start_date not in prices[ticker] or end_date not in prices[ticker]:
                # Missing price data - set return to 0 for this period
                returns[ticker][(start_date, end_date)] = 0.0
                continue
            
            price_start = prices[ticker][start_date]
            price_end = prices[ticker][end_date]
            
            # Skip if either price is None (no NAV data available)
            if price_start is None or price_end is None:
                returns[ticker][(start_date, end_date)] = 0.0
                continue
            
            period_return = (price_end / price_start) - 1

            # Use centralized FX logic for consistency across all views
            is_mf = ticker in mutual_fund_tickers
            if needs_fx_adjustment(ticker, is_mutual_fund=is_mf, nav_dict=nav_dict):
                fx_return = get_fx_return(start_date, end_date, cache)
                cad_adjusted_return = (1 + period_return) * (1 + fx_return) - 1
                returns[ticker][(start_date, end_date)] = cad_adjusted_return
                # DEBUG: Log period return calculation
                logger.debug(f"Period {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}: {ticker} price_start={price_start:.2f} price_end={price_end:.2f} period_return={period_return*100:.2f}% fx_return={fx_return*100:.2f}% -> final={cad_adjusted_return*100:.2f}%")
            else:
                returns[ticker][(start_date, end_date)] = period_return
                # DEBUG: Log period return calculation
                logger.debug(f"Period {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}: {ticker} price_start={price_start:.2f} price_end={price_end:.2f} -> return={period_return*100:.2f}%")

    
    return returns, prices


def calculate_benchmark_returns(dates, cache):
    """Calculate returns for all benchmarks."""
    from constants import BENCHMARK_TICKERS, FX_TICKER
    
    benchmark_returns = {}
    
    for bench_name, ticker in BENCHMARK_TICKERS.items():
        benchmark_returns[bench_name] = {}
        for i in range(len(dates) - 1):
            start_date = pd.to_datetime(dates[i])
            end_date = pd.to_datetime(dates[i+1])
            
            if ticker == FX_TICKER:
                benchmark_returns[bench_name][(start_date, end_date)] = get_fx_return(start_date, end_date, cache)
            else:
                price_start = get_price_on_date(ticker, start_date, cache)
                price_end = get_price_on_date(ticker, end_date, cache)
                if price_start is None or price_end is None or price_start == 0:
                    benchmark_returns[bench_name][(start_date, end_date)] = 0.0
                else:
                    raw_return = (price_end / price_start) - 1
                    # Apply USD->CAD FX for non-CAD benchmarks so they are comparable to the CAD portfolio
                    # ^GSPTSE (TSX) is CAD-denominated; everything else (^GSPC, ^DJI, ^IXIC, ACWI) is USD
                    if ticker == "^GSPTSE":
                        benchmark_returns[bench_name][(start_date, end_date)] = raw_return
                    else:
                        fx_return = get_fx_return(start_date, end_date, cache)
                        benchmark_returns[bench_name][(start_date, end_date)] = (1 + raw_return) * (1 + fx_return) - 1
    
    return benchmark_returns


def build_results_dataframe(weights_dict, returns, prices, dates, cache, mutual_fund_tickers=None, custom_sectors=None):
    """Build the results DataFrame with all periods and YTD."""
    from constants import CASH_TICKER, FX_TICKER
    if mutual_fund_tickers is None:
        mutual_fund_tickers = set()
    
    all_tickers = sorted(weights_dict.keys())
    
    periods = []
    for i in range(len(dates) - 1):
        start_date = pd.to_datetime(dates[i])
        end_date = pd.to_datetime(dates[i+1])
        periods.append((start_date, end_date))
    
    first_date = pd.to_datetime(dates[0])
    last_date = pd.to_datetime(dates[-1])
    
    data = []
    for ticker in all_tickers:
        row = {"Ticker": ticker}
        
        for period_idx, period in enumerate(periods):
            start_date, end_date = period
            # Weights are keyed by their startDate in the config — the weight at start_date
            # is the allocation in effect DURING this period, not the one at end_date
            # (which may reflect a rebalance that takes effect after the period).
            weight = weights_dict.get(ticker, {}).get(start_date, 0.0)
            period_return = returns.get(ticker, {}).get(period, 0.0)
            contribution = weight * period_return

            # DEBUG: Log period details with comprehensive audit info
            if ticker.upper() == "CCO.TO":
                logger.info(f"AUDIT CCO.TO Period {period_idx} ({start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')})")
                logger.info(f"  weight_raw={weight:.6f} weight_pct={weight*100:.2f}%")
                logger.info(f"  return_raw={period_return:.6f} return_pct={period_return*100:.2f}%")
                logger.info(f"  contribution_raw={contribution:.6f} contribution_pct={contribution*100:.2f}%")
                logger.info(f"  contribution_bps={contribution*10000:.1f} (for formatBps which does val*100)")
            logger.debug(f"Period {period_idx} ({start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}): {ticker} weight={weight:.4f} ({weight*100:.2f}%) return={period_return:.4f} ({period_return*100:.2f}%) contribution={contribution:.6f}")

            row[f"Weight_{period_idx}"] = weight
            row[f"Return_{period_idx}"] = period_return
            row[f"Contrib_{period_idx}"] = contribution
        
        if ticker == CASH_TICKER:
            ytd_return = 0.0
            ytd_contrib = 0.0
        else:
            if ticker in prices and first_date in prices[ticker] and last_date in prices[ticker]:
                first_price = prices[ticker][first_date]
                last_price = prices[ticker][last_date]
                
                # Guard against None values (missing NAV data)
                if first_price is None or last_price is None:
                    ytd_return = 0.0
                else:
                    ytd_return = (last_price / first_price) - 1
                    
                    if needs_fx_adjustment(ticker, is_mutual_fund=(ticker in mutual_fund_tickers)):
                        fx_start = get_price_on_date(FX_TICKER, first_date, cache)
                        fx_end = get_price_on_date(FX_TICKER, last_date, cache)
                        if fx_start is not None and fx_end is not None and fx_start != 0:
                            fx_return = (fx_end / fx_start) - 1
                            ytd_return = (1 + ytd_return) * (1 + fx_return) - 1
            else:
                ytd_return = 0.0
            
            # Forward-compounded contribution (ATTRIBUTION_LOGIC.md §4)
            # C = Σ_t [ w_t × r_t × Π_{s>t}(1 + r_s) ]
            sub_data = [
                (weights_dict.get(ticker, {}).get(period[0], 0.0),
                 returns.get(ticker, {}).get(period, 0.0))
                for period in periods
            ]
            ytd_contrib = 0.0
            for t_idx in range(len(sub_data)):
                w_t, r_t = sub_data[t_idx]
                forward_factor = 1.0
                for s_idx in range(t_idx + 1, len(sub_data)):
                    _, r_s = sub_data[s_idx]
                    forward_factor *= (1.0 + r_s)
                ytd_contrib += w_t * r_t * forward_factor
        
        row["YTD_Return"] = ytd_return
        row["YTD_Contrib"] = ytd_contrib
        
        data.append(row)
    
    df = pd.DataFrame(data)
    
    if not df.empty and "YTD_Contrib" in df.columns:
        df = df.sort_values("YTD_Contrib", ascending=False)
    
    return df, periods


def get_ticker_performance(tickers, cache):
    """
    Get performance for a list of tickers for YTD, 3M, 6M, 1Y.
    Returns a dictionary keyed by ticker.
    """
    import datetime
    
    today = datetime.datetime.now()
    # Ensure time is zeroed out for consistency
    today = pd.to_datetime(today.date())
    
    # Define start dates
    dates = {
        "1Y": today - pd.DateOffset(years=1),
        "6M": today - pd.DateOffset(months=6),
        "3M": today - pd.DateOffset(months=3),
        "YTD": pd.to_datetime(datetime.date(today.year, 1, 1))
    }
    
    results = {}
    
    for ticker in tickers:
        if ticker == "CADCAD=X":
            results[ticker] = {
                "YTD": 0.0,
                "3M": 0.0,
                "6M": 0.0,
                "1Y": 0.0
            }
            continue
            
        ticker_results = {}
        
        # Get current price
        current_price = get_price_on_date(ticker, today, cache)
        if current_price is None:
            # Fallback if today's price is not available (e.g. weekend), try yesterday
            current_price = get_price_on_date(ticker, today - pd.Timedelta(days=1), cache)
        if current_price is None:
            results[ticker] = {k: 0.0 for k in dates}
            continue

        for period_name, start_date in dates.items():
            try:
                start_price = get_price_on_date(ticker, start_date, cache)
                if start_price is not None and start_price != 0:
                    ret = (current_price / start_price) - 1
                    ticker_results[period_name] = ret
                else:
                    ticker_results[period_name] = 0.0
            except Exception:
                ticker_results[period_name] = 0.0
                
        results[ticker] = ticker_results
        
    return results

