"""Portfolio analysis routes: /analyze-manual"""

import json
import logging
import re
from pathlib import Path
from typing import List

import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException

from data_loader import load_historic_nav_csvs, load_manual_navs_json, merge_nav_sources
from market_data import (
    calculate_returns,
    calculate_benchmark_returns,
    build_results_dataframe,
    create_monthly_periods,
    build_monthly_dataframe,
    calculate_monthly_benchmark_returns,
)
from cache_manager import load_cache, save_cache, clear_cache, get_cache_info
from services.period_normalizer import normalize_portfolio_periods
from services.path_utils import resolve_storage_path
from services.workspace_service import build_portfolio_workspace
from services.yfinance_setup import configure_yfinance_cache
from models import (
    PortfolioItem,
    ManualAnalysisRequest,
    PeriodBoundary,
    PeriodDetail,
    MonthDetail,
    PeriodSheetRow,
    MonthlySheetRow,
    PortfolioAnalysisResponse,
)

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
# Core analysis logic (shared between file-upload and manual entry)
# ---------------------------------------------------------------------------

def run_portfolio_analysis(
    weights_dict,
    nav_dict,
    dates,
    mutual_fund_tickers=None,
    etf_tickers=None,
    cash_tickers=None,
) -> PortfolioAnalysisResponse:
    """Core logic shared between file upload and manual entry."""
    weights_dict, dates = normalize_portfolio_periods(weights_dict, dates)

    cache = load_cache()
    if mutual_fund_tickers is None:
        mutual_fund_tickers = set()
    if etf_tickers is None:
        etf_tickers = set()
    if cash_tickers is None:
        cash_tickers = set()
    mutual_fund_tickers = set(mutual_fund_tickers or set()) | set(nav_dict.keys())

    logger.info("Fetching market data...")
    returns, prices = calculate_returns(weights_dict, nav_dict, dates, cache, mutual_fund_tickers)

    save_cache(cache)

    # Load custom sector weights if available
    custom_sectors = {}
    sector_path = resolve_storage_path("data/custom_sectors.json")
    if sector_path.exists():
        try:
            with open(sector_path, "r") as f:
                custom_sectors = json.load(f)
        except Exception:
            pass

    logger.info("Building results dataframe...")
    df, periods = build_results_dataframe(
        weights_dict,
        returns,
        prices,
        dates,
        cache,
        mutual_fund_tickers,
        custom_sectors,
        nav_dict=nav_dict,
    )

    if df.empty:
        return PortfolioAnalysisResponse(
            items=[],
            periodSheet=[],
            monthlySheet=[],
            periods=[],
            monthlyPeriods=[],
            benchmarkReturns={},
            benchmarkMonthlyReturns={},
        )

    # ── Monthly sheet ────────────────────────────────────────────────────────
    logger.info("Building monthly sheet...")
    monthly_periods = create_monthly_periods(periods)
    monthly_df = build_monthly_dataframe(
        weights_dict, monthly_periods, periods, df,
        prices, cache, nav_dict=nav_dict, mutual_fund_tickers=mutual_fund_tickers,
    )

    # ── Benchmark returns (period-level and monthly-level) ───────────────────
    logger.info("Computing benchmark returns...")
    try:
        bench_raw = calculate_benchmark_returns(dates, cache)
        # bench_raw = {bench_name: {(start_ts, end_ts): float}} — align with periods list
        bench_period_lists = {
            name: [float(returns_map.get(p, 0.0)) for p in periods]
            for name, returns_map in bench_raw.items()
        }
    except Exception as e:
        logger.warning(f"Failed to compute period benchmark returns: {e}")
        bench_period_lists = {}

    try:
        bench_monthly_lists = calculate_monthly_benchmark_returns(monthly_periods, cache)
        bench_monthly_lists = {k: [float(v) for v in vs] for k, vs in bench_monthly_lists.items()}
    except Exception as e:
        logger.warning(f"Failed to compute monthly benchmark returns: {e}")
        bench_monthly_lists = {}

    save_cache(cache)

    # ── Flat items list (existing serialization — unchanged for all other views) ─
    now_ts = pd.Timestamp.now().normalize()
    result_items = []

    for i, period in enumerate(periods):
        end_date_ts = period[1]
        display_ts = end_date_ts if end_date_ts <= now_ts else now_ts
        date_str = display_ts.strftime("%Y-%m-%d")

        for _, row in df.iterrows():
            ticker = row["Ticker"]
            t_upper = ticker.upper().strip()

            weight = row.get(f"Weight_{i}", 0.0)
            ret = row.get(f"Return_{i}", 0.0)
            contrib = row.get(f"Contrib_{i}", 0.0)

            ticker_custom_sectors = custom_sectors.get(ticker)

            sp = None
            ep = None
            if ticker in prices:
                sp_val = prices[ticker].get(period[0])
                ep_val = prices[ticker].get(period[1])
                sp = float(sp_val) if sp_val is not None else None
                ep = float(ep_val) if ep_val is not None else None

            item = PortfolioItem(
                ticker=ticker,
                weight=float(weight),
                date=date_str,
                returnPct=float(ret),
                contribution=float(contrib),
                companyName=None,
                sector="Mixed" if ticker_custom_sectors else None,
                notes=None,
                isMutualFund=t_upper in mutual_fund_tickers,
                isEtf=t_upper in etf_tickers,
                isCash=t_upper in cash_tickers,
                sectorWeights=ticker_custom_sectors,
                startPrice=sp,
                endPrice=ep,
            )
            result_items.append(item)

    seen: dict = {}
    for item in result_items:
        seen[(item.ticker, item.date)] = item
    items = list(seen.values())

    # ── Period sheet serialization ───────────────────────────────────────────
    period_sheet_rows = []
    for _, row in df.iterrows():
        ticker = row["Ticker"]
        period_details = [
            PeriodDetail(
                weight=float(row.get(f"Weight_{i}", 0.0)),
                returnPct=float(row.get(f"Return_{i}", 0.0)),
                contribution=float(row.get(f"Contrib_{i}", 0.0)),
            )
            for i in range(len(periods))
        ]
        period_sheet_rows.append(PeriodSheetRow(
            ticker=ticker,
            periods=period_details,
            ytdReturn=float(row.get("YTD_Return", 0.0)),
            ytdContrib=float(row.get("YTD_Contrib", 0.0)),
        ))

    # ── Monthly sheet serialization ──────────────────────────────────────────
    monthly_sheet_rows = []
    for _, row in monthly_df.iterrows():
        ticker = row["Ticker"]
        month_details = [
            MonthDetail(
                returnPct=float(row.get(f"Return_{i}", 0.0)),
                contribution=float(row.get(f"Contrib_{i}", 0.0)),
            )
            for i in range(len(monthly_periods))
        ]
        monthly_sheet_rows.append(MonthlySheetRow(
            ticker=ticker,
            months=month_details,
            ytdReturn=float(row.get("YTD_Return", 0.0)),
            ytdContrib=float(row.get("YTD_Contrib", 0.0)),
        ))

    # ── Period / monthly boundary lists ─────────────────────────────────────
    period_boundaries = [
        PeriodBoundary(start=p[0].strftime("%Y-%m-%d"), end=p[1].strftime("%Y-%m-%d"))
        for p in periods
    ]
    monthly_period_boundaries = [
        PeriodBoundary(start=p[0].strftime("%Y-%m-%d"), end=p[1].strftime("%Y-%m-%d"))
        for p in monthly_periods
    ]

    return PortfolioAnalysisResponse(
        items=items,
        periodSheet=period_sheet_rows,
        monthlySheet=monthly_sheet_rows,
        periods=period_boundaries,
        monthlyPeriods=monthly_period_boundaries,
        benchmarkReturns=bench_period_lists,
        benchmarkMonthlyReturns=bench_monthly_lists,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze-manual", response_model=PortfolioAnalysisResponse)
async def analyze_manual(request: ManualAnalysisRequest):
    try:
        weights_dict = {}
        dates_set = set()

        for item in request.items:
            ticker = item.ticker.upper().strip()
            if not ticker or "TICKER" in ticker:
                continue

            try:
                dt = pd.to_datetime(item.date)
                dates_set.add(dt)

                if ticker not in weights_dict:
                    weights_dict[ticker] = {}

                w_val = item.weight
                if isinstance(w_val, str):
                    is_percentage = "%" in w_val
                    val_str = w_val.replace("%", "").strip()
                    try:
                        w = float(val_str)
                        if is_percentage:
                            w = w / 100.0
                    except ValueError:
                        logger.warning(f"Invalid weight string: {w_val}")
                        continue
                else:
                    w = float(w_val)

                weights_dict[ticker][dt] = w
            except Exception as e:
                logger.warning(f"Skipping invalid item {item}: {e}")

        dates = sorted(list(dates_set))
        if not dates:
            raise HTTPException(status_code=400, detail="No valid dates found in data")

        nav_dict = get_aggregated_nav_data()

        mutual_fund_tickers = {item.ticker.upper().strip() for item in request.items if item.isMutualFund}
        etf_tickers = {item.ticker.upper().strip() for item in request.items if item.isEtf}
        cash_tickers = {item.ticker.upper().strip() for item in request.items if item.isCash}
        company_name_map = get_company_name_map(list(weights_dict.keys()), mutual_fund_tickers, cash_tickers)

        analysis = run_portfolio_analysis(weights_dict, nav_dict, dates, mutual_fund_tickers, etf_tickers, cash_tickers)
        for item in analysis.items:
            ticker_upper = item.ticker.upper().strip()
            if ticker_upper not in mutual_fund_tickers and ticker_upper not in cash_tickers:
                item.companyName = company_name_map.get(ticker_upper)
            else:
                item.companyName = None
        return analysis

    except Exception as e:
        logger.error(f"Error in manual analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
