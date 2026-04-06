"""Market data fetching and return calculations."""

from functools import lru_cache
import logging
from time import perf_counter
import pandas as pd
import yfinance as yf
from constants import CASH_TICKER, FX_TICKER, INDICES
from cache_manager import load_cache, save_cache
from services.path_utils import resolve_storage_path
from services.yfinance_setup import configure_yfinance_cache
from services.attribution_math import (
    apply_fx_adjustment,
    forward_compounded_contribution,
    forward_compound_series,
    geometric_chain,
    price_return,
)

logger = logging.getLogger(__name__)
NAV_LOOKBACK_WINDOW_DAYS = 10
PRICE_HISTORY_LOOKBACK_WINDOW_DAYS = 10
HISTORY_CLOSE_CACHE_VERSION = "v6"  # bumped: prefer adjusted close over raw close in all readers
PREFERRED_PRICE_FIELDS = ("Adj Close", "Adj_Close", "Close")

configure_yfinance_cache()


def _price_history_filename(ticker: str) -> str:
    return (
        ticker.upper().strip()
        .replace(".", "_")
        .replace("-", "_")
        .replace("^", "")
        .replace("=", "_")
    )


def build_history_close_cache_key(ticker: str, date) -> str:
    normalized_date = pd.to_datetime(date).normalize()
    normalized_ticker = str(ticker).upper().strip()
    return f"history_close_{HISTORY_CLOSE_CACHE_VERSION}::{normalized_ticker}_{normalized_date.strftime('%Y-%m-%d')}"


def _extract_price_frame(downloaded: pd.DataFrame | pd.Series, tickers: list[str]) -> pd.DataFrame:
    if downloaded is None or getattr(downloaded, "empty", True):
        return pd.DataFrame()

    if isinstance(downloaded, pd.Series):
        return downloaded.to_frame(name=tickers[0])

    if isinstance(downloaded.columns, pd.MultiIndex):
        for field in PREFERRED_PRICE_FIELDS:
            try:
                prices = downloaded[field]
            except KeyError:
                try:
                    prices = downloaded.xs(field, axis=1, level=0, drop_level=True)
                except KeyError:
                    continue
            if isinstance(prices, pd.Series):
                return prices.to_frame(name=tickers[0])
            return prices

    for field in PREFERRED_PRICE_FIELDS:
        if field in downloaded.columns:
            prices = downloaded[field]
            if isinstance(prices, pd.Series):
                return prices.to_frame(name=tickers[0])
            return prices

    return downloaded


def extract_download_price_frame(downloaded: pd.DataFrame | pd.Series, tickers: list[str]) -> pd.DataFrame:
    return _extract_price_frame(downloaded, tickers)


def extract_history_price_series(history_frame: pd.DataFrame | pd.Series) -> pd.Series:
    prices = _extract_price_frame(history_frame, ["price"])
    if prices.empty:
        return pd.Series(dtype=float)
    if isinstance(prices, pd.Series):
        return prices
    first_col = prices.columns[0]
    return prices[first_col]


@lru_cache(maxsize=256)
def load_local_price_history(ticker: str) -> pd.Series:
    path = resolve_storage_path(f"data/price_history/{_price_history_filename(ticker)}.csv")
    if not path.exists():
        return pd.Series(dtype=float)

    try:
        frame = pd.read_csv(path)
    except Exception as exc:
        logger.warning("Failed to read local price history for %s: %s", ticker, exc)
        return pd.Series(dtype=float)

    date_col = next((col for col in frame.columns if str(col).lower() == "date"), None)
    value_priority = ("adj_close", "adj close")
    value_col = None
    lower_map = {str(col).lower(): col for col in frame.columns}
    for candidate in value_priority:
        if candidate in lower_map:
            value_col = lower_map[candidate]
            break
    if date_col is None or value_col is None:
        logger.warning("Local price history for %s is missing expected columns", ticker)
        return pd.Series(dtype=float)

    normalized_index = pd.to_datetime(frame[date_col]).dt.normalize()
    series = pd.Series(frame[value_col].values, index=normalized_index, dtype=float)
    series = series[~series.index.duplicated(keep="last")].sort_index().dropna()
    return series


def get_local_price_on_or_before(ticker: str, date, lookback_days: int = PRICE_HISTORY_LOOKBACK_WINDOW_DAYS) -> float | None:
    series = load_local_price_history(ticker)
    if series.empty:
        return None

    normalized_date = pd.to_datetime(date).normalize()
    if normalized_date in series.index:
        return float(series.loc[normalized_date])

    prior = series.loc[series.index < normalized_date]
    if prior.empty:
        return None

    prior_date = prior.index[-1]
    if (normalized_date - prior_date).days > lookback_days:
        return None

    return float(prior.iloc[-1])


def load_local_close_frame(tickers: list[str]) -> pd.DataFrame:
    frames = []
    for ticker in tickers:
        series = load_local_price_history(ticker)
        if series.empty:
            continue
        frames.append(series.rename(ticker))

    if not frames:
        return pd.DataFrame()

    close_frame = pd.concat(frames, axis=1).sort_index()
    close_frame.index = pd.to_datetime(close_frame.index).normalize()
    return close_frame


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
    cache_key = build_history_close_cache_key(ticker, date)
    
    if cache_key in cache:
        return cache[cache_key]

    local_price = get_local_price_on_or_before(ticker, date)
    if local_price is not None:
        cache[cache_key] = local_price
        return local_price
    
    try:
        start_date = date - pd.Timedelta(days=10)
        stock = yf.Ticker(ticker)
        started_at = perf_counter()
        hist = stock.history(start=start_date, end=date + pd.Timedelta(days=1), timeout=5, auto_adjust=True)
        elapsed = perf_counter() - started_at
        if elapsed >= 1.0:
            logger.info(
                "market_data.get_price_on_date slow call: ticker=%s, date=%s, duration=%.3fs",
                ticker,
                date.strftime("%Y-%m-%d"),
                elapsed,
            )

        if hist.empty:
            raise ValueError(f"No data available for {ticker} on {date}")

        price_series = extract_history_price_series(hist).dropna()
        if price_series.empty:
            raise ValueError(f"No adjusted-close data available for {ticker} on {date}")
        price = float(price_series.iloc[-1])
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


def get_fx_return(start_date, end_date, cache):
    """Get FX return for CAD=X over the period."""
    fx_start = get_price_on_date(FX_TICKER, start_date, cache)
    fx_end = get_price_on_date(FX_TICKER, end_date, cache)
    if fx_start is None or fx_end is None or fx_start == 0:
        return 0.0
    return (fx_end / fx_start) - 1




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

