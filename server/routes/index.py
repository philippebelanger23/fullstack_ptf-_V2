"""Index data routes: /index-exposure, /index-history, /currency-performance, /sector-history"""

import datetime
import json
import logging
from pathlib import Path

import pandas as pd
import yfinance as yf
from fastapi import APIRouter

from cache_manager import load_cache, save_cache
from market_data import extract_download_price_frame, get_ticker_performance
from services.yfinance_setup import configure_yfinance_cache

configure_yfinance_cache()

router = APIRouter()
logger = logging.getLogger(__name__)

STALENESS_THRESHOLD = datetime.timedelta(days=7)


def _resolve_exposure_path() -> Path:
    """Return the path to index_exposure.json, checking relative then absolute."""
    data_path = Path("data/index_exposure.json")
    if not data_path.exists():
        data_path = Path(__file__).parent.parent / "data" / "index_exposure.json"
    return data_path


def _exposure_is_stale(data_path: Path) -> bool:
    """True if the exposure file is missing or its scraped_at / as_of_date is older than STALENESS_THRESHOLD."""
    if not data_path.exists():
        return True
    try:
        with open(data_path, "r") as f:
            raw = json.load(f)
        # Prefer scraped_at timestamp, fall back to ACWI as_of_date
        date_str = raw.get("scraped_at", "")[:10] or raw.get("ACWI", {}).get("as_of_date", "")
        if not date_str:
            return True
        data_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
        return datetime.datetime.now() - data_date > STALENESS_THRESHOLD
    except Exception:
        return True


@router.post("/index-refresh")
def refresh_index_data():
    """Force re-scrape index exposure and clear the history cache so next fetch is fresh."""
    results = {}

    # 1. Re-scrape exposure data
    try:
        from index_scraper import scrape_index_data
        scrape_index_data()
        results["exposure"] = "ok"
    except Exception as e:
        logger.error(f"index-refresh: scrape failed: {e}")
        results["exposure"] = f"error: {e}"

    # 2. Delete history cache so it is regenerated on next request
    history_cache = Path("data/index_history_cache.json")
    if not history_cache.exists():
        history_cache = Path(__file__).parent.parent / "data" / "index_history_cache.json"
    try:
        if history_cache.exists():
            history_cache.unlink()
        results["history_cache"] = "cleared"
    except Exception as e:
        logger.error(f"index-refresh: failed to delete history cache: {e}")
        results["history_cache"] = f"error: {e}"

    return results


@router.get("/index-exposure")
def get_index_exposure():
    try:
        data_path = _resolve_exposure_path()

        # Auto re-scrape if data is older than 7 days
        if _exposure_is_stale(data_path):
            logger.info("Index exposure data is stale (>7 days), re-scraping...")
            try:
                from index_scraper import scrape_index_data
                scrape_index_data()
                # Re-resolve in case the file was just created
                data_path = _resolve_exposure_path()
            except Exception as scrape_err:
                logger.error(f"Auto re-scrape failed: {scrape_err}")

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
                sector_list.append(
                    {
                        "sector": sector,
                        "ACWI": w_acwi,
                        "TSX": w_tsx,
                        "Index": round(w_composite, 2),
                    }
                )

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
                    "weight": round(w_composite, 2),
                    "ACWI": round(w_acwi, 2),
                    "TSX": round(w_tsx, 2),
                })

        geo_list.sort(key=lambda x: x["weight"], reverse=True)

        scraped_date = acwi.get("as_of_date", "")
        if not scraped_date:
            scraped_date = raw_data.get("scraped_at", "")[:10]

        return {
            "sectors": sector_list,
            "geography": geo_list,
            "last_scraped": scraped_date,
            "raw": {
                "ACWI": {"Geography": acwi.get("Geography", {})},
                "TSX": {"Geography": tsx.get("Geography", {})},
            },
        }
    except Exception as e:
        logger.error(f"Error in index-exposure: {e}")
        return {"sectors": [], "geography": []}


@router.post("/currency-performance")
async def currency_performance(request: dict):
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


@router.get("/index-history")
def get_index_history():
    """
    Fetch historical data for ACWI (global) and XIC.TO (Canada) for the comparison graph.
    Also fetches USDCAD=X to convert ACWI to CAD, and calculates a synthetic 75/25 composite (75% ACWI, 25% XIC.TO).
    Caches the result to avoid repeated slow yfinance calls.
    """
    cache_file = Path("data/index_history_cache.json")

    if cache_file.exists():
        try:
            mtime = datetime.datetime.fromtimestamp(cache_file.stat().st_mtime)
            if datetime.datetime.now() - mtime < datetime.timedelta(hours=1):
                with open(cache_file, "r") as f:
                    logger.info("Serving index history from cache")
                    return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read index history cache: {e}")

    logger.info("Fetching fresh index history from yfinance...")
    tickers = ["ACWI", "XIC.TO", "USDCAD=X"]

    try:
        data = yf.download(tickers, period="5y", interval="1d", progress=False, auto_adjust=True)

        if data.empty:
            return {"ACWI": [], "XIC.TO": [], "Index": []}

        closes = extract_download_price_frame(data, tickers)

        expected_cols = ["ACWI", "XIC.TO", "USDCAD=X"]
        existing_cols = [c for c in expected_cols if c in closes.columns]

        if not existing_cols:
            return {"ACWI": [], "XIC.TO": [], "Index": []}

        closes = closes[existing_cols].ffill().bfill()

        result_data = {"ACWI": [], "XIC.TO": [], "Index": []}

        dates = closes.index.strftime("%Y-%m-%d").tolist()

        if "ACWI" in closes.columns and "USDCAD=X" in closes.columns:
            acwi_cad_series = closes["ACWI"] * closes["USDCAD=X"]
        else:
            acwi_cad_series = pd.Series(dtype=float)

        if "XIC.TO" in closes.columns:
            xic_series = closes["XIC.TO"]
        else:
            xic_series = pd.Series(dtype=float)

        if not acwi_cad_series.empty and not xic_series.empty:
            acwi_ret = acwi_cad_series.pct_change().fillna(0)
            xic_ret = xic_series.pct_change().fillna(0)

            # Synthetic 75/25 composite
            composite_ret = (acwi_ret * 0.75) + (xic_ret * 0.25)
            composite_index = (1 + composite_ret).cumprod() * 100
        else:
            composite_index = pd.Series(dtype=float)

        acwi_list = acwi_cad_series.tolist() if not acwi_cad_series.empty else []
        xic_list = xic_series.tolist() if not xic_series.empty else []
        comp_list = composite_index.tolist() if not composite_index.empty else []

        for i, date_str in enumerate(dates):
            if i < len(acwi_list) and pd.notna(acwi_list[i]):
                result_data["ACWI"].append({"date": date_str, "value": acwi_list[i]})

            if i < len(xic_list) and pd.notna(xic_list[i]):
                result_data["XIC.TO"].append({"date": date_str, "value": xic_list[i]})

            if i < len(comp_list) and pd.notna(comp_list[i]):
                result_data["Index"].append({"date": date_str, "value": comp_list[i]})

        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w") as f:
                json.dump(result_data, f)
        except Exception as e:
            logger.error(f"Failed to write index history cache: {e}")

        return result_data

    except Exception as e:
        logger.error(f"Error fetching index history: {e}")
        return {"ACWI": [], "XIC.TO": [], "Index": []}


@router.get("/sector-history")
def get_sector_history():
    """
    Fetch historical data for major sector ETFs to use as benchmarks.
    Returns nested structure: {"US": {sector: [{date, value}]}, "CA": {sector: [{date, value}]}}
    """
    cache_file = Path("data/sector_history_cache.json")

    if cache_file.exists():
        try:
            mtime = datetime.datetime.fromtimestamp(cache_file.stat().st_mtime)
            if datetime.datetime.now() - mtime < datetime.timedelta(hours=1):
                with open(cache_file, "r") as f:
                    cached = json.load(f)
                    if "US" in cached and "OVERALL" in cached:
                        return cached
        except Exception as e:
            logger.warning(f"Failed to read sector history cache: {e}")

    # US Select Sector SPDR ETFs
    us_sector_map = {
        "Information Technology": "XLK",
        "Financials": "XLF",
        "Health Care": "XLV",
        "Consumer Discretionary": "XLY",
        "Communication Services": "XLC",
        "Industrials": "XLI",
        "Consumer Staples": "XLP",
        "Energy": "XLE",
        "Utilities": "XLU",
        "Real Estate": "XLRE",
        "Materials": "XLB",
    }

    # Canadian iShares / BMO sector ETFs (TSX-listed)
    # Sectors without a pure Canadian ETF fall back to TSX (XIC.TO)
    ca_sector_map = {
        "Financials": "XFN.TO",
        "Energy": "XEG.TO",
        "Materials": "XMA.TO",
        "Industrials": "ZIN.TO",
        "Information Technology": "XIT.TO",
        "Utilities": "XUT.TO",
        "Real Estate": "XRE.TO",
        "Consumer Staples": "XST.TO",
        "Consumer Discretionary": "XCD.TO",
        "Health Care": "XIC.TO",           # No pure CA healthcare ETF → TSX fallback
        "Communication Services": "XIC.TO", # No CA comm services ETF → TSX fallback
    }

    # Overall market benchmarks for broad index comparison
    overall_map = {
        "SP500": "SPY",
        "TSX": "XIC.TO",
    }

    all_tickers = list(set(list(us_sector_map.values()) + list(ca_sector_map.values()) + list(overall_map.values())))
    logger.info(f"Fetching fresh sector history for {len(all_tickers)} tickers (US + CA)...")

    try:
        data = yf.download(all_tickers, period="5y", interval="1d", progress=False, auto_adjust=True)
        if data.empty:
            return {"US": {}, "CA": {}}

        closes = extract_download_price_frame(data, all_tickers)

        closes = closes.ffill().bfill()
        dates = closes.index.strftime("%Y-%m-%d").tolist()

        def build_region_data(sector_map):
            region_data = {}
            for sector, ticker in sector_map.items():
                if ticker in closes.columns:
                    series = closes[ticker].tolist()
                    points = [
                        {"date": d, "value": v}
                        for d, v in zip(dates, series)
                        if pd.notna(v)
                    ]
                    if points:
                        region_data[sector] = points
            return region_data

        result_data = {
            "US": build_region_data(us_sector_map),
            "CA": build_region_data(ca_sector_map),
            "OVERALL": build_region_data(overall_map),
        }

        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w") as f:
                json.dump(result_data, f)
        except Exception as e:
            logger.error(f"Failed to write sector history cache: {e}")

        return result_data
    except Exception as e:
        logger.error(f"Error fetching sector history: {e}")
        return {"US": {}, "CA": {}}
