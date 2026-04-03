"""Market data fetching and return calculations."""

import logging
import pandas as pd
import yfinance as yf
from constants import CASH_TICKER, FX_TICKER, INDICES
from cache_manager import load_cache, save_cache
from services.attribution_math import (
    apply_fx_adjustment,
    forward_compounded_contribution,
    forward_compound_series,
    geometric_chain,
    price_return,
)

logger = logging.getLogger(__name__)
NAV_LOOKBACK_WINDOW_DAYS = 10


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
    cache_key = f"history_close_v1::{ticker}_{date.strftime('%Y-%m-%d')}"
    
    if cache_key in cache:
        return cache[cache_key]
    
    try:
        start_date = date - pd.Timedelta(days=10)
        stock = yf.Ticker(ticker)
        hist = stock.history(start=start_date, end=date + pd.Timedelta(days=1))

        if hist.empty:
            raise ValueError(f"No data available for {ticker} on {date}")

        close_price = hist["Close"]
        price = float(close_price.iloc[-1])
        cache[cache_key] = price
        return price
    except Exception as e:
        logger.warning(f"Error fetching price for {ticker} on {date}: {str(e)}. Returning None.")
        return None


def _get_normalized_nav_series(ticker, nav_dict):
    """Return NAV data keyed by normalized Timestamp for robust boundary matching."""
    if ticker not in nav_dict:
        return {}

    normalized = {}
    for raw_date, raw_value in nav_dict[ticker].items():
        if pd.isna(raw_value):
            continue
        normalized[pd.to_datetime(raw_date).normalize()] = float(raw_value)
    return normalized


def get_nav_price_on_or_before(ticker, date, nav_dict):
    """
    Resolve NAV for an analysis boundary using the same directionality as stock
    price lookup: exact date first, otherwise the latest available prior value
    within a short lookback window.
    """
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
    """Resolve one analysis boundary price from NAVs/cache using normalized dates."""
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
            date_val = pd.to_datetime(date_val).normalize()
            
            if ticker in nav_dict:
                prices[ticker][date_val] = get_nav_price_on_or_before(ticker, date_val, nav_dict)
            else:
                # Standard Yahoo Finance lookup
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
            
            period_return = price_return(price_start, price_end)

            # Use centralized FX logic for consistency across all views
            is_mf = ticker in mutual_fund_tickers
            needs_fx = needs_fx_adjustment(ticker, is_mutual_fund=is_mf, nav_dict=nav_dict)
            fx_return = get_fx_return(start_date, end_date, cache) if needs_fx else 0.0
            cad_adjusted_return = apply_fx_adjustment(period_return, fx_return, needs_fx)
            if needs_fx:
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
            start_date = pd.to_datetime(dates[i]).normalize()
            end_date = pd.to_datetime(dates[i+1]).normalize()
            
            if ticker == FX_TICKER:
                benchmark_returns[bench_name][(start_date, end_date)] = get_fx_return(start_date, end_date, cache)
            else:
                price_start = get_price_on_date(ticker, start_date, cache)
                price_end = get_price_on_date(ticker, end_date, cache)
                if price_start is None or price_end is None or price_start == 0:
                    benchmark_returns[bench_name][(start_date, end_date)] = 0.0
                else:
                    raw_return = price_return(price_start, price_end)
                    # Apply USD->CAD FX for non-CAD benchmarks so they are comparable to the CAD portfolio
                    # ^GSPTSE (TSX) is CAD-denominated; everything else (^GSPC, ^DJI, ^IXIC, ACWI) is USD
                    if ticker == "^GSPTSE":
                        benchmark_returns[bench_name][(start_date, end_date)] = raw_return
                    else:
                        fx_return = get_fx_return(start_date, end_date, cache)
                        benchmark_returns[bench_name][(start_date, end_date)] = apply_fx_adjustment(raw_return, fx_return, True)
    
    return benchmark_returns


def build_results_dataframe(
    weights_dict,
    returns,
    prices,
    dates,
    cache,
    mutual_fund_tickers=None,
    custom_sectors=None,
    nav_dict=None,
):
    """Build the results DataFrame with all periods and YTD."""
    from constants import CASH_TICKER, FX_TICKER
    if mutual_fund_tickers is None:
        mutual_fund_tickers = set()
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

                ytd_return = price_return(first_price, last_price)

                needs_fx = needs_fx_adjustment(
                    ticker,
                    is_mutual_fund=(ticker in mutual_fund_tickers),
                    nav_dict=nav_dict,
                )
                if needs_fx:
                    fx_start = get_price_on_date(FX_TICKER, first_date, cache)
                    fx_end = get_price_on_date(FX_TICKER, last_date, cache)
                    fx_return = price_return(fx_start, fx_end)
                    ytd_return = apply_fx_adjustment(ytd_return, fx_return, True)
            else:
                ytd_return = 0.0

            sub_data = [
                (weights_dict.get(ticker, {}).get(period[0], 0.0),
                 returns.get(ticker, {}).get(period, 0.0))
                for period in periods
            ]
            ytd_contrib = forward_compounded_contribution(sub_data)
        
        row["YTD_Return"] = ytd_return
        row["YTD_Contrib"] = ytd_contrib
        
        data.append(row)
    
    df = pd.DataFrame(data)
    
    if not df.empty and "YTD_Contrib" in df.columns:
        df = df.sort_values("YTD_Contrib", ascending=False)
    
    return df, periods


def create_monthly_periods(periods):
    """
    Build calendar-month buckets from the normalized period chain.

    Each monthly period is (month_start, month_end) where month_start is the
    previous boundary and month_end is the calendar month end for that bucket.
    The final partial month uses the last analysis date as its end.

    Returns
    -------
    list[(pd.Timestamp, pd.Timestamp)]
    """
    if not periods:
        return []

    period_starts = [pd.Timestamp(period[0]).normalize() for period in periods]
    period_ends = [pd.Timestamp(period[1]).normalize() for period in periods]
    first_start = min(period_starts)
    last_end = max(period_ends)

    monthly_ends = [
        pd.Timestamp(dt).normalize()
        for dt in pd.date_range(
            start=first_start + pd.Timedelta(days=1),
            end=last_end,
            freq="ME",
        )
    ]
    if not monthly_ends or monthly_ends[-1] != last_end:
        monthly_ends.append(last_end)

    monthly_periods = []
    month_start = first_start
    for month_end in monthly_ends:
        monthly_periods.append((month_start, month_end))
        month_start = month_end

    return monthly_periods


def build_monthly_dataframe(weights_dict, monthly_periods, periods, period_df,
                            prices, cache, nav_dict=None, mutual_fund_tickers=None):
    """
    Build the monthly-level results DataFrame for the live attribution contract.

    Monthly return  : (price_end / price_start) - 1, FX-adjusted.
    Monthly contrib : percentage-point contribution, forward-compounded across
                      sub-periods within the month.
    YTD contrib     : Σ_m [ C_m × Π_{n>m}(1 + R_n) ]

    Invariant: YTD_Contrib == period_df["YTD_Contrib"] for every ticker.

    Returns
    -------
    pd.DataFrame  — one row per ticker, columns Return_i / Contrib_i per month + YTD_*
    """
    from constants import CASH_TICKER

    if nav_dict is None:
        nav_dict = {}
    if mutual_fund_tickers is None:
        mutual_fund_tickers = set()

    all_tickers = sorted(weights_dict.keys())
    data = []

    for ticker in all_tickers:
        row = {"Ticker": ticker}

        for period_idx, (monthly_start, monthly_end) in enumerate(monthly_periods):
            # ── Monthly return ──────────────────────────────────────────────
            if ticker == CASH_TICKER:
                monthly_return = 0.0
            else:
                try:
                    ps = resolve_price_on_date(ticker, monthly_start, prices, nav_dict, cache)
                    pe = resolve_price_on_date(ticker, monthly_end, prices, nav_dict, cache)
                    if ps is not None and pe is not None and ps > 0:
                        monthly_return = price_return(ps, pe)
                        is_mf = ticker in mutual_fund_tickers
                        needs_fx = needs_fx_adjustment(ticker, is_mutual_fund=is_mf, nav_dict=nav_dict)
                        if needs_fx:
                            fx_r = get_fx_return(monthly_start, monthly_end, cache)
                            monthly_return = apply_fx_adjustment(monthly_return, fx_r, True)
                    else:
                        monthly_return = 0.0
                except Exception:
                    monthly_return = 0.0

            # ── Monthly contribution (forward-compounded within month) ──────
            # Formula: Σ_{t ∈ month} [ w_t × r_t × Π_{s>t, s∈month}(1+r_s) ]
            ticker_data = period_df[period_df["Ticker"] == ticker]
            sub_periods_in_month = []
            if not ticker_data.empty:
                for sp_idx, sp in enumerate(periods):
                    sp_start, sp_end = sp
                    if sp_start >= monthly_start and sp_end <= monthly_end:
                        w_col = f"Weight_{sp_idx}"
                        r_col = f"Return_{sp_idx}"
                        if w_col in period_df.columns and r_col in period_df.columns:
                            w_t = ticker_data[w_col].iloc[0]
                            r_t = ticker_data[r_col].iloc[0]
                            if pd.notna(w_t) and pd.notna(r_t):
                                sub_periods_in_month.append((float(w_t), float(r_t)))

            contribution = forward_compounded_contribution(sub_periods_in_month)

            row[f"Return_{period_idx}"] = monthly_return
            row[f"Contrib_{period_idx}"] = contribution

        # ── YTD ─────────────────────────────────────────────────────────────
        if ticker == CASH_TICKER:
            ytd_return = 0.0
            ytd_contrib = 0.0
        else:
            # Geometric chain of monthly returns
            monthly_returns = [row.get(f"Return_{mp_idx}", 0.0) for mp_idx in range(len(monthly_periods))]
            monthly_contributions = [row.get(f"Contrib_{m_idx}", 0.0) for m_idx in range(len(monthly_periods))]
            ytd_return = geometric_chain(monthly_returns)
            ytd_contrib = forward_compound_series(monthly_contributions, monthly_returns)

        row["YTD_Return"] = ytd_return
        row["YTD_Contrib"] = ytd_contrib
        data.append(row)

    df = pd.DataFrame(data)
    if not df.empty and "YTD_Contrib" in df.columns:
        df = df.sort_values("YTD_Contrib", ascending=False)
    return df


def calculate_monthly_benchmark_returns(monthly_periods, cache):
    """
    Calculate benchmark returns for each monthly period boundary.

    Parameters
    ----------
    monthly_periods : list[(pd.Timestamp, pd.Timestamp)]
    cache           : dict

    Returns
    -------
    dict  {bench_name: [float, ...]}  — one float per monthly period, in order
    """
    from constants import BENCHMARK_TICKERS, FX_TICKER

    benchmark_returns = {}

    for bench_name, ticker in BENCHMARK_TICKERS.items():
        benchmark_returns[bench_name] = []
        for start_date, end_date in monthly_periods:
            if ticker == FX_TICKER:
                r = get_fx_return(start_date, end_date, cache)
            else:
                ps = get_price_on_date(ticker, start_date, cache)
                pe = get_price_on_date(ticker, end_date, cache)
                if ps is None or pe is None or ps == 0:
                    r = 0.0
                else:
                    raw = (pe / ps) - 1
                    if ticker == "^GSPTSE":
                        r = raw
                    else:
                        fx = get_fx_return(start_date, end_date, cache)
                        r = (1 + raw) * (1 + fx) - 1
            benchmark_returns[bench_name].append(r)

    return benchmark_returns


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

