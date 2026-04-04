"""Market data fetching and return calculations."""

import pandas as pd
import yfinance as yf
from constants import CASH_TICKER, FX_TICKER

NAV_LOOKBACK_WINDOW_DAYS = 10


def needs_fx_adjustment(ticker, nav_dict):
    """Return True if ticker needs USDâ†’CAD FX adjustment."""
    if ticker in nav_dict:
        return False
    if ticker.endswith('.TO') or ticker == "^GSPTSE":
        return False
    return True


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
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"Error fetching price for {ticker} on {date}: {type(e).__name__}: {str(e)}")


def _get_normalized_nav_series(ticker, nav_dict):
    """Return one normalized NAV series keyed by normalized Timestamp."""
    if ticker not in nav_dict:
        return {}

    normalized = {}
    for raw_date, raw_value in nav_dict[ticker].items():
        if pd.isna(raw_value):
            continue
        normalized[pd.to_datetime(raw_date).normalize()] = float(raw_value)
    return normalized


def get_nav_price_on_or_before(ticker, date, nav_dict):
    """Resolve NAV like stock prices: exact date first, otherwise latest prior value."""
    ticker_navs = _get_normalized_nav_series(ticker, nav_dict)
    if not ticker_navs:
        return None

    date = pd.to_datetime(date).normalize()

    if date in ticker_navs:
        return ticker_navs[date]

    available_dates = sorted(ticker_navs.keys())
    prior_dates = [d for d in available_dates if d < date]
    if prior_dates:
        prior_date = prior_dates[-1]
        if (date - prior_date).days <= NAV_LOOKBACK_WINDOW_DAYS:
            return ticker_navs[prior_date]

    return None


def resolve_price_on_date(ticker, date, prices, nav_dict, cache):
    """Use one boundary-resolution rule for both MF NAVs and market prices."""
    date = pd.to_datetime(date).normalize()

    if ticker in nav_dict:
        if date in prices.get(ticker, {}) and prices[ticker][date] is not None:
            return prices[ticker][date]
        return get_nav_price_on_or_before(ticker, date, nav_dict)

    if date in prices.get(ticker, {}):
        return prices[ticker][date]
    return get_price_on_date(ticker, date, cache)


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
            date_val = pd.to_datetime(date_str).normalize()
            
            if ticker in nav_dict:
                prices[ticker][date_val] = get_nav_price_on_or_before(ticker, date_val, nav_dict)
            else:
                prices[ticker][date_val] = get_price_on_date(ticker, date_val, cache)
    
    for ticker in all_tickers:
        if ticker == CASH_TICKER:
            returns[ticker] = {}
            for i in range(len(dates) - 1):
                start_date = pd.to_datetime(dates[i]).normalize()
                end_date = pd.to_datetime(dates[i+1]).normalize()
                returns[ticker][(start_date, end_date)] = 0.0
            continue
        
        returns[ticker] = {}
        for i in range(len(dates) - 1):
            start_date = pd.to_datetime(dates[i]).normalize()
            end_date = pd.to_datetime(dates[i+1]).normalize()
            
            if ticker not in prices or start_date not in prices[ticker] or end_date not in prices[ticker]:
                raise ValueError(f"Missing price data for {ticker} on {start_date} or {end_date}")
            
            price_start = prices[ticker][start_date]
            price_end = prices[ticker][end_date]
            period_return = (price_end / price_start) - 1
            
            if needs_fx_adjustment(ticker, nav_dict):
                fx_return = get_fx_return(start_date, end_date, cache)
                cad_adjusted_return = (1 + period_return) * (1 + fx_return) - 1
                returns[ticker][(start_date, end_date)] = cad_adjusted_return
            else:
                returns[ticker][(start_date, end_date)] = period_return
    
    return returns, prices


def calculate_benchmark_returns(dates, cache):
    """Calculate returns for all benchmarks."""
    from constants import BENCHMARK_TICKERS, FX_TICKER
    
    benchmark_returns = {}
    
    for bench_name, ticker in BENCHMARK_TICKERS.items():
        benchmark_returns[bench_name] = {}
        for i in range(len(dates) - 1):
            start_date = pd.to_datetime(dates[i]).normalize()
            end_date = pd.to_datetime(dates[i+1]).normalize()
            
            if ticker == FX_TICKER:
                benchmark_returns[bench_name][(start_date, end_date)] = get_fx_return(start_date, end_date, cache)
            else:
                price_start = get_price_on_date(ticker, start_date, cache)
                price_end = get_price_on_date(ticker, end_date, cache)
                benchmark_returns[bench_name][(start_date, end_date)] = (price_end / price_start) - 1
    
    return benchmark_returns


def build_results_dataframe(weights_dict, returns, prices, dates, cache, nav_dict=None):
    """Build the results DataFrame with all periods and YTD."""
    from constants import CASH_TICKER, FX_TICKER
    
    if nav_dict is None:
        nav_dict = {}
    
    all_tickers = sorted(weights_dict.keys())
    
    periods = []
    for i in range(len(dates) - 1):
        start_date = pd.to_datetime(dates[i]).normalize()
        end_date = pd.to_datetime(dates[i+1]).normalize()
        periods.append((start_date, end_date))
    
    first_date = pd.to_datetime(dates[0]).normalize()
    last_date = pd.to_datetime(dates[-1]).normalize()
    
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
                
                if needs_fx_adjustment(ticker, nav_dict):
                    fx_start = get_price_on_date(FX_TICKER, first_date, cache)
                    fx_end = get_price_on_date(FX_TICKER, last_date, cache)
                    fx_return = (fx_end / fx_start) - 1
                    ytd_return = (1 + ytd_return) * (1 + fx_return) - 1
            else:
                ytd_return = 0.0
            
            # Forward-compounded YTD contribution:
            # Each sub-period's w_t Ã— r_t is compounded forward through
            # remaining sub-period returns, so contribution is consistent
            # with the geometric YTD return.
            # Formula: Î£_t [ w_t Ã— r_t Ã— Î _{s>t}(1 + r_s) ]
            sub_data = []
            for period in periods:
                w = weights_dict.get(ticker, {}).get(period[0], 0.0)
                r = returns.get(ticker, {}).get(period, 0.0)
                sub_data.append((w, r))
            
            ytd_contrib = 0.0
            for t_idx, (w_t, r_t) in enumerate(sub_data):
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
