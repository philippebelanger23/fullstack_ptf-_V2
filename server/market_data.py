"""Market data fetching and return calculations."""

import pandas as pd
import yfinance as yf
from constants import CASH_TICKER, FX_TICKER, INDICES
from cache_manager import load_cache, save_cache


def get_price_on_date(ticker, date, cache):
    """Get price for a ticker on a specific date, using cache if available."""
    cache_key = f"{ticker}_{date.strftime('%Y-%m-%d')}"
    
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        end_date = date
        start_date = date - pd.Timedelta(days=10)
        
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=end_date + pd.Timedelta(days=1))
        
        if hist.empty:
            raise ValueError(f"No data available for {ticker} on {date}")
        
        price = hist['Close'].iloc[-1]
        cache[cache_key] = price
        return price
    except Exception as e:
        raise ValueError(f"Error fetching price for {ticker} on {date}: {str(e)}")


def get_fx_return(start_date, end_date, cache):
    """Get FX return for CAD=X over the period."""
    fx_start = get_price_on_date(FX_TICKER, start_date, cache)
    fx_end = get_price_on_date(FX_TICKER, end_date, cache)
    return (fx_end / fx_start) - 1


def calculate_returns(weights_dict, nav_dict, dates, cache):
    """Calculate returns for all holdings across all periods."""
    all_tickers = set(weights_dict.keys())
    all_tickers = sorted(all_tickers)
    
    prices = {}
    returns = {}
    
    for ticker in all_tickers:
        if ticker == CASH_TICKER:
            continue
        
        prices[ticker] = {}
        for date_str in dates:
            date_val = pd.to_datetime(date_str, format="%d/%m/%Y")
            
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
                        # No previous data available. 
                        # If it's a manual ticker, Yahoo probably won't have it either, but we can try 
                        # or just error out more gracefully.
                        # For now, let's try the fallback to get_price_on_date only if we really have to,
                        # but avoiding it for known manual tickers is safer to prevent 500s.
                        try:
                             prices[ticker][date_val] = get_price_on_date(ticker, date_val, cache)
                        except Exception:
                             # If both fail, raise a clear error or default to 0?
                             # Raising error is better than 500.
                             raise ValueError(f"No pricing data available for {ticker} on {date_val} (and no history found)")
            else:
                # Standard Yahoo Finance lookup
                prices[ticker][date_val] = get_price_on_date(ticker, date_val, cache)
    
    for ticker in all_tickers:
        if ticker == CASH_TICKER:
            returns[ticker] = {}
            for i in range(len(dates) - 1):
                start_date = pd.to_datetime(dates[i], format="%d/%m/%Y")
                end_date = pd.to_datetime(dates[i+1], format="%d/%m/%Y")
                returns[ticker][(start_date, end_date)] = 0.0
            continue
        
        returns[ticker] = {}
        for i in range(len(dates) - 1):
            start_date = pd.to_datetime(dates[i], format="%d/%m/%Y")
            end_date = pd.to_datetime(dates[i+1], format="%d/%m/%Y")
            
            if ticker not in prices or start_date not in prices[ticker] or end_date not in prices[ticker]:
                raise ValueError(f"Missing price data for {ticker} on {start_date} or {end_date}")
            
            price_start = prices[ticker][start_date]
            price_end = prices[ticker][end_date]
            period_return = (price_end / price_start) - 1
            
            # Mutual funds (in nav_dict) use NAV data directly without FX adjustment
            if ticker in nav_dict:
                returns[ticker][(start_date, end_date)] = period_return
            elif ticker.endswith('.TO') or ticker == "^GSPTSE":
                returns[ticker][(start_date, end_date)] = period_return
            else:
                fx_return = get_fx_return(start_date, end_date, cache)
                cad_adjusted_return = (1 + period_return) * (1 + fx_return) - 1
                returns[ticker][(start_date, end_date)] = cad_adjusted_return
    
    return returns, prices


def calculate_benchmark_returns(dates, cache):
    """Calculate returns for all benchmarks."""
    from constants import BENCHMARK_TICKERS, FX_TICKER
    
    benchmark_returns = {}
    
    for bench_name, ticker in BENCHMARK_TICKERS.items():
        benchmark_returns[bench_name] = {}
        for i in range(len(dates) - 1):
            start_date = pd.to_datetime(dates[i], format="%d/%m/%Y")
            end_date = pd.to_datetime(dates[i+1], format="%d/%m/%Y")
            
            if ticker == FX_TICKER:
                benchmark_returns[bench_name][(start_date, end_date)] = get_fx_return(start_date, end_date, cache)
            else:
                price_start = get_price_on_date(ticker, start_date, cache)
                price_end = get_price_on_date(ticker, end_date, cache)
                benchmark_returns[bench_name][(start_date, end_date)] = (price_end / price_start) - 1
    
    return benchmark_returns


def build_results_dataframe(weights_dict, returns, prices, dates, cache):
    """Build the results DataFrame with all periods and YTD."""
    from constants import CASH_TICKER, FX_TICKER
    
    all_tickers = sorted(weights_dict.keys())
    
    periods = []
    for i in range(len(dates) - 1):
        start_date = pd.to_datetime(dates[i], format="%d/%m/%Y")
        end_date = pd.to_datetime(dates[i+1], format="%d/%m/%Y")
        periods.append((start_date, end_date))
    
    first_date = pd.to_datetime(dates[0], format="%d/%m/%Y")
    last_date = pd.to_datetime(dates[-1], format="%d/%m/%Y")
    
    data = []
    for ticker in all_tickers:
        row = {"Ticker": ticker}
        
        for period_idx, period in enumerate(periods):
            start_date, end_date = period
            weight = weights_dict.get(ticker, {}).get(start_date, 0.0)
            period_return = returns.get(ticker, {}).get(period, 0.0)
            contribution = weight * period_return
            
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
                ytd_return = (last_price / first_price) - 1
                
                if not ticker.endswith('.TO') and ticker != "^GSPTSE":
                    fx_start = get_price_on_date(FX_TICKER, first_date, cache)
                    fx_end = get_price_on_date(FX_TICKER, last_date, cache)
                    fx_return = (fx_end / fx_start) - 1
                    ytd_return = (1 + ytd_return) * (1 + fx_return) - 1
            else:
                ytd_return = 0.0
            
            ytd_contrib = sum(
                returns.get(ticker, {}).get(period, 0.0) * weights_dict.get(ticker, {}).get(period[0], 0.0)
                for period in periods
            )
        
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
        try:
            current_price = get_price_on_date(ticker, today, cache)
        except Exception as e:
            # Fallback if today's price is not available (e.g. weekend), try yesterday
            try:
                current_price = get_price_on_date(ticker, today - pd.Timedelta(days=1), cache)
            except:
                 # If totally failed, skip
                results[ticker] = {k: 0.0 for k in dates}
                continue

        for period_name, start_date in dates.items():
            try:
                start_price = get_price_on_date(ticker, start_date, cache)
                if start_price and start_price != 0:
                    ret = (current_price / start_price) - 1
                    ticker_results[period_name] = ret
                else:
                    ticker_results[period_name] = 0.0
            except Exception:
                ticker_results[period_name] = 0.0
                
        results[ticker] = ticker_results
        
    return results

