"""Market data routes: /fetch-sectors, /fetch-performance, /fetch-betas, /fetch-dividends"""

import datetime
import json
import logging
from pathlib import Path

import yfinance as yf
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter

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
            tickers_obj = yf.Tickers(" ".join(missing_on_server))

            for ticker in missing_on_server:
                try:
                    info = tickers_obj.tickers[ticker].info
                    sector = info.get("sector")

                    if not sector:
                        quote_type = info.get("quoteType", "").upper()
                        if quote_type in ["ETF", "MUTUALFUND"]:
                            sector = "Mixed"

                    if sector:
                        server_cache[ticker] = sector
                except Exception as e:
                    logger.warning(f"Failed to fetch info for {ticker}: {e}")

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
        tickers_obj = yf.Tickers(" ".join(unique_tickers))

        today = datetime.date.today()

        for ticker in unique_tickers:
            try:
                hist = tickers_obj.tickers[ticker].history(period="1y")

                if hist.empty:
                    continue

                current_price = hist["Close"].iloc[-1]

                def get_pct_change(days_ago=None, months_ago=None, start_year=False):
                    if start_year:
                        start_date = datetime.date(today.year, 1, 1)
                    elif months_ago:
                        start_date = today - relativedelta(months=months_ago)
                    else:
                        return 0.0

                    hist_dates = hist.index.date

                    target_idx = hist.index[hist.index.date <= start_date]
                    if target_idx.empty:
                        if start_year:
                            return (current_price - hist["Close"].iloc[0]) / hist["Close"].iloc[0]
                        return None

                    start_price = hist.loc[target_idx[-1]]["Close"]
                    return (current_price - start_price) / start_price

                perf = {}
                perf["YTD"] = get_pct_change(start_year=True)
                perf["1Y"] = get_pct_change(months_ago=12)
                perf["6M"] = get_pct_change(months_ago=6)
                perf["3M"] = get_pct_change(months_ago=3)

                results[ticker] = perf

            except Exception as e:
                logger.warning(f"Failed to fetch performance for {ticker}: {e}")

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
            tickers_obj = yf.Tickers(" ".join(to_fetch))

            for ticker in to_fetch:
                try:
                    found_ticker = tickers_obj.tickers.get(ticker)
                    if not found_ticker:
                        found_ticker = yf.Ticker(ticker)

                    info = found_ticker.info

                    quote_type = info.get("quoteType", "").upper()
                    if quote_type in ["ETF", "MUTUALFUND"]:
                        beta_value = 1.0
                    else:
                        beta = info.get("beta")
                        beta_value = beta if beta is not None else 1.0

                    results[ticker] = beta_value
                    server_cache[ticker] = beta_value

                except Exception as e:
                    logger.warning(f"Failed to fetch beta for {ticker}: {e}")
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
        except Exception as e:
            logger.warning(f"Failed to load dividend cache file: {e}")

    to_fetch = []

    for ticker in unique_tickers:
        if ticker in server_cache:
            results[ticker] = server_cache[ticker]
            continue

        t_upper = ticker.upper()
        if "CASH" in t_upper or "$" in t_upper:
            results[ticker] = 0.0
            server_cache[ticker] = 0.0
        else:
            to_fetch.append(ticker)

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
                                return 0.0
                            if v < 1.0:
                                return v * 100.0
                            elif v > 50.0:
                                return v / 100.0
                            else:
                                return v
                        except (ValueError, TypeError):
                            return 0.0

                    div_yield_pct = normalize_yield(info.get("dividendYield"))
                    if div_yield_pct == 0:
                        div_yield_pct = normalize_yield(info.get("trailingAnnualDividendYield"))

                    results[ticker] = div_yield_pct
                    server_cache[ticker] = div_yield_pct

                except Exception as e:
                    logger.warning(f"Failed to fetch dividend for {ticker}: {e}")
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
