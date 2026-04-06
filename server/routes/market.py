"""Market data routes: /fetch-sectors, /fetch-performance, /fetch-betas, /fetch-dividends"""

import datetime
import json
import logging
from pathlib import Path

import yfinance as yf
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter
from market_data import extract_history_price_series
from services.yfinance_parallel import parallel_fetch
from services.yfinance_setup import configure_yfinance_cache

configure_yfinance_cache()

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/fetch-sectors")
async def fetch_sectors(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}

    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))

    # --- Server-Side Persistence ---
    cache_file = Path("data/sectors_cache.json")
    server_cache = {}

    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                server_cache = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load sector cache file: {e}")

    # Manual sector overrides — yfinance misclassifies these tickers.
    # ATD.TO (Alimentation Couche-Tard): yfinance returns "Consumer Cyclical" but it is
    # a convenience-store operator → Consumer Staples.
    SECTOR_OVERRIDES: dict[str, str] = {
        "ATD.TO": "Consumer Staples",
    }

    # Apply overrides into the cache so they are used downstream
    for ticker, sector in SECTOR_OVERRIDES.items():
        server_cache[ticker] = sector

    missing_on_server = [t for t in unique_tickers if t not in server_cache]

    if missing_on_server:
        try:
            def _fetch_sector(ticker: str) -> str | None:
                info = yf.Ticker(ticker).info
                sector = info.get("sector")
                if not sector:
                    quote_type = info.get("quoteType", "").upper()
                    if quote_type in ["ETF", "MUTUALFUND"]:
                        sector = "Mixed"
                return sector

            sector_results, failures = parallel_fetch(missing_on_server, _fetch_sector, max_workers=8)
            for ticker, sector in sector_results.items():
                if sector:
                    server_cache[ticker] = sector
            for ticker, exc in failures.items():
                logger.warning(f"Failed to fetch info for {ticker}: {exc}")

            try:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w") as f:
                    json.dump(server_cache, f)
            except Exception as e:
                logger.error(f"Failed to save sector cache: {e}")

        except Exception as e:
            logger.error(f"Error fetching sectors: {e}")

    return {k: server_cache[k] for k in unique_tickers if k in server_cache}


@router.post("/fetch-performance")
async def fetch_performance(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}

    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    results = {}

    try:
        today = datetime.date.today()

        def _fetch_performance(ticker: str) -> dict[str, float | None] | None:
            hist = yf.Ticker(ticker).history(period="1y", auto_adjust=True)
            price_series = extract_history_price_series(hist).dropna()

            if hist.empty or price_series.empty:
                return None

            current_price = float(price_series.iloc[-1])

            def get_pct_change(days_ago=None, months_ago=None, start_year=False):
                if start_year:
                    start_date = datetime.date(today.year, 1, 1)
                elif months_ago:
                    start_date = today - relativedelta(months=months_ago)
                else:
                    return 0.0

                target_idx = price_series.index[price_series.index.date <= start_date]
                if target_idx.empty:
                    if start_year:
                        first_price = float(price_series.iloc[0])
                        return (current_price - first_price) / first_price
                    return None

                start_price = float(price_series.loc[target_idx[-1]])
                return (current_price - start_price) / start_price

            return {
                "YTD": get_pct_change(start_year=True),
                "1Y": get_pct_change(months_ago=12),
                "6M": get_pct_change(months_ago=6),
                "3M": get_pct_change(months_ago=3),
            }

        perf_results, failures = parallel_fetch(unique_tickers, _fetch_performance, max_workers=8)
        for ticker, perf in perf_results.items():
            if perf is not None:
                results[ticker] = perf
        for ticker, exc in failures.items():
            logger.warning(f"Failed to fetch performance for {ticker}: {exc}")

        return results

    except Exception as e:
        logger.error(f"Error fetching performance: {e}")
        return {}


@router.post("/fetch-betas")
async def fetch_betas(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}

    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    results = {}

    cache_file = Path("data/betas_cache.json")
    server_cache = {}

    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                server_cache = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load beta cache file: {e}")

    to_fetch = []

    for ticker in unique_tickers:
        if ticker in server_cache:
            results[ticker] = server_cache[ticker]
            continue

        t_upper = ticker.upper()
        if (
            t_upper.startswith("TDB")
            or t_upper.startswith("DYN")
            or (t_upper.startswith("X") and t_upper.endswith(".TO"))
            or (t_upper.startswith("V") and t_upper.endswith(".TO"))
            or (t_upper.startswith("Z") and t_upper.endswith(".TO"))
            or (t_upper.startswith("H") and t_upper.endswith(".TO"))
            or "CASH" in t_upper
            or "$" in t_upper
        ):
            results[ticker] = 1.0
            server_cache[ticker] = 1.0
        else:
            to_fetch.append(ticker)

    if to_fetch:
        try:
            def _fetch_beta(ticker: str) -> float:
                info = yf.Ticker(ticker).info
                quote_type = info.get("quoteType", "").upper()
                if quote_type in ["ETF", "MUTUALFUND"]:
                    return 1.0
                beta = info.get("beta")
                return beta if beta is not None else 1.0

            beta_results, failures = parallel_fetch(to_fetch, _fetch_beta, max_workers=8)
            for ticker, beta_value in beta_results.items():
                results[ticker] = beta_value
                server_cache[ticker] = beta_value
            for ticker, exc in failures.items():
                logger.warning(f"Failed to fetch beta for {ticker}: {exc}")
                results[ticker] = 1.0
                server_cache[ticker] = 1.0

        except Exception as e:
            logger.error(f"Error fetching betas: {e}")

    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(server_cache, f)
    except Exception as e:
        logger.error(f"Failed to save beta cache: {e}")

    return results


@router.post("/fetch-dividends")
async def fetch_dividends(request: dict):
    tickers = request.get("tickers", [])
    if not tickers:
        return {}

    unique_tickers = list(set([t.strip() for t in tickers if t and isinstance(t, str)]))
    results = {}

    cache_file = Path("data/dividends_cache.json")
    server_cache = {}

    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                server_cache = json.load(f)
            server_cache = {str(k).upper(): v for k, v in server_cache.items()}
        except Exception as e:
            logger.warning(f"Failed to load dividend cache file: {e}")

    to_fetch = []

    for ticker in unique_tickers:
        ticker_key = ticker.upper()

        if ticker_key in server_cache:
            results[ticker_key] = server_cache[ticker_key]
            continue

        if "CASH" in ticker_key or "$" in ticker_key:
            results[ticker_key] = 0.0
            server_cache[ticker_key] = 0.0
        else:
            to_fetch.append(ticker_key)

    if to_fetch:
        try:
            def _fetch_dividend(ticker: str) -> float:
                info = yf.Ticker(ticker).info

                # yfinance 1.2.0: dividendYield is already a percentage value
                # (e.g. 0.41 = 0.41%, 5.15 = 5.15%) - use as-is.
                # trailingAnnualDividendYield is a decimal fraction
                # (e.g. 0.00408 = 0.41%) - multiply by 100.
                def pct_from_fraction(val):
                    if val is None:
                        return 0.0
                    try:
                        v = float(val)
                        return max(0.0, v * 100.0)
                    except (ValueError, TypeError):
                        return 0.0

                raw = info.get("dividendYield")
                if raw is not None:
                    try:
                        div_yield_pct = max(0.0, float(raw))
                    except (ValueError, TypeError):
                        div_yield_pct = 0.0
                else:
                    div_yield_pct = 0.0

                if div_yield_pct == 0:
                    div_yield_pct = pct_from_fraction(info.get("trailingAnnualDividendYield"))

                return div_yield_pct

            dividend_results, failures = parallel_fetch(to_fetch, _fetch_dividend, max_workers=8)
            for ticker, dividend_yield in dividend_results.items():
                results[ticker] = dividend_yield
                server_cache[ticker] = dividend_yield
            for ticker, exc in failures.items():
                logger.warning(f"Failed to fetch dividend for {ticker}: {exc}")
                results[ticker] = 0.0
                server_cache[ticker] = 0.0

        except Exception as e:
            logger.error(f"Error fetching dividends: {e}")

    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(server_cache, f)
    except Exception as e:
        logger.error(f"Failed to save dividend cache: {e}")

    return results