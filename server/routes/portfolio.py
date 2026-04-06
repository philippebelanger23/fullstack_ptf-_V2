"""Portfolio analysis routes: /portfolio-workspace"""

import json
import logging
import re

import yfinance as yf
from fastapi import APIRouter, HTTPException

from data_loader import load_historic_nav_csvs, load_manual_navs_json, merge_nav_sources
from cache_manager import clear_cache, get_cache_info
from services.path_utils import resolve_storage_path
from services.workspace_service import build_portfolio_workspace
from services.yfinance_setup import configure_yfinance_cache
from models import ManualAnalysisRequest

configure_yfinance_cache()

router = APIRouter()
logger = logging.getLogger(__name__)

_COMPANY_SUFFIX_PATTERNS = [
    re.compile(r"(?:,?\s+)(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc|llc|lp|l\.p\.|n\.v\.|nv|s\.a\.|sa|s\.p\.a\.|spa|ag|se)\.?$", re.IGNORECASE),
    re.compile(r"(?:,?\s+)(?:etf|etfs)\.?$", re.IGNORECASE),
]


# ---------------------------------------------------------------------------
# Shared NAV helper
# ---------------------------------------------------------------------------

def get_aggregated_nav_data() -> dict:
    """
    Load and aggregate NAV data from all server-side sources:
    1. manual_navs.json
    2. historic_navs/*.csv
    """
    manual_navs = load_manual_navs_json("data/manual_navs.json")
    csv_navs = {}
    try:
        csv_navs = load_historic_nav_csvs("data/historic_navs")
    except Exception as e:
        logger.warning(f"Failed to load historical CSV NAVs: {e}")

    return merge_nav_sources(manual_navs, csv_navs)


def normalize_company_name(raw_name: str | None) -> str | None:
    """
    Trim common legal suffixes and cleanup noise from yfinance display names.
    Returns the original string if normalization would over-trim it.
    """
    if not isinstance(raw_name, str):
        return None

    original = re.sub(r"\s+", " ", raw_name).strip()
    if not original:
        return None

    cleaned = re.sub(r"^\s*the\s+", "", original, flags=re.IGNORECASE)

    while True:
        next_name = cleaned
        for pattern in _COMPANY_SUFFIX_PATTERNS:
            next_name = pattern.sub("", next_name)
        next_name = re.sub(r"[,\s]+$", "", next_name).strip(" .,-")
        next_name = re.sub(r"\s+", " ", next_name).strip()
        if next_name == cleaned:
            break
        cleaned = next_name

    if not cleaned:
        return original

    return cleaned


def resolve_company_name_from_info(info: dict) -> str | None:
    for key in ("shortName", "displayName", "longName", "name"):
        name = normalize_company_name(info.get(key))
        if name:
            return name
    return None


def get_company_name_map(tickers: list[str], mutual_fund_tickers: set[str], cash_tickers: set[str]) -> dict[str, str]:
    """
    Resolve display names for stocks and ETFs.
    Mutual funds stay ticker-based in the One Pager, so they are excluded here.
    """
    cache_file = resolve_storage_path("data/company_names_cache.json")
    server_cache: dict[str, str] = {}
    cache_dirty = False

    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    for key, value in loaded.items():
                        if not isinstance(key, str) or not isinstance(value, str):
                            continue
                        normalized_key = key.upper()
                        normalized_value = normalize_company_name(value)
                        if normalized_value:
                            server_cache[normalized_key] = normalized_value
                            if normalized_value != value:
                                cache_dirty = True
        except Exception as e:
            logger.warning(f"Failed to load company name cache file: {e}")

    unique_tickers = sorted({
        t.strip().upper()
        for t in tickers
        if isinstance(t, str) and t.strip()
    })
    missing = [
        t for t in unique_tickers
        if t not in server_cache and t not in mutual_fund_tickers and t not in cash_tickers
    ]

    cache_written = False
    if missing:
        try:
            tickers_obj = yf.Tickers(" ".join(missing))
            for ticker in missing:
                try:
                    info = tickers_obj.tickers[ticker].info
                    display_name = resolve_company_name_from_info(info)
                    if display_name:
                        server_cache[ticker] = display_name
                except Exception as e:
                    logger.warning(f"Failed to fetch company name for {ticker}: {e}")

            try:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, "w") as f:
                    json.dump(server_cache, f)
                cache_written = True
            except Exception as e:
                logger.warning(f"Failed to save company name cache: {e}")
        except Exception as e:
            logger.warning(f"Error fetching company names: {e}")

    if cache_dirty and not cache_written:
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w") as f:
                json.dump(server_cache, f)
        except Exception as e:
            logger.warning(f"Failed to rewrite normalized company name cache: {e}")

    return {ticker: server_cache[ticker] for ticker in unique_tickers if ticker in server_cache}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/portfolio-workspace")
async def portfolio_workspace(request: ManualAnalysisRequest):
    try:
        return build_portfolio_workspace(request.items)
    except Exception as e:
        logger.error(f"Error building portfolio workspace: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Cache management endpoints
# ---------------------------------------------------------------------------

@router.post("/cache/clear")
def clear_market_cache():
    """Clear the entire market data price cache, forcing fresh yfinance fetches."""
    clear_cache()
    return {"success": True, "message": "Market data cache cleared"}


@router.get("/cache/info")
def market_cache_info():
    """Return metadata about the current market data cache."""
    return get_cache_info()
