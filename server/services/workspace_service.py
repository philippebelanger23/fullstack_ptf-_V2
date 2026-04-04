"""Canonical portfolio workspace service."""

from __future__ import annotations

from contextlib import contextmanager
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

from cache_manager import load_cache, save_cache
from constants import BENCHMARK_TICKERS, CASH_TICKER, FX_TICKER
from data_loader import load_historic_nav_csvs, load_manual_navs_json, merge_nav_sources
from market_data import (
    PRICE_HISTORY_LOOKBACK_WINDOW_DAYS,
    build_history_close_cache_key,
    extract_download_price_frame,
    get_fx_return,
    get_nav_price_on_or_before,
    get_price_on_date,
    load_local_close_frame,
    needs_fx_adjustment,
)
from services.attribution_math import (
    apply_fx_adjustment,
    forward_compounded_contribution,
    geometric_chain,
    price_return,
)
from services.backcast_service import (
    aggregate_period_weights,
    build_benchmark_returns,
    build_period_weighted_portfolio_returns,
    compute_backcast_metrics,
    compute_beta,
    compute_annualized_vol,
    compute_rolling_metrics,
    fetch_returns_df,
    is_cash_ticker,
)
from services.period_normalizer import normalize_portfolio_periods
from services.path_utils import resolve_storage_path
from services.yfinance_setup import configure_yfinance_cache

logger = logging.getLogger(__name__)

configure_yfinance_cache()

_COMPANY_SUFFIX_PATTERNS = [
    re.compile(r"(?:,?\s+)(?:incorporated|inc|corporation|corp|company|co|limited|ltd|plc|llc|lp|l\.p\.|n\.v\.|nv|s\.a\.|sa|s\.p\.a\.|spa|ag|se)\.?$", re.IGNORECASE),
    re.compile(r"(?:,?\s+)(?:etf|etfs)\.?$", re.IGNORECASE),
]

SECTOR_NAME_ALIASES = {
    "Information Technology": "Information Technology",
    "Information Tech": "Information Technology",
    "Technology": "Information Technology",
    "Financials": "Financials",
    "Financial Services": "Financials",
    "Finance": "Financials",
    "Health Care": "Health Care",
    "Healthcare": "Health Care",
    "Consumer Discretionary": "Consumer Discretionary",
    "Consumer Cyclical": "Consumer Discretionary",
    "Cyclical Consumer": "Consumer Discretionary",
    "Communication Services": "Communication Services",
    "Communications": "Communication Services",
    "Industrials": "Industrials",
    "Industrial": "Industrials",
    "Consumer Staples": "Consumer Staples",
    "Consumer Defensive": "Consumer Staples",
    "Energy": "Energy",
    "Oil & Gas": "Energy",
    "Utilities": "Utilities",
    "Utility": "Utilities",
    "Real Estate": "Real Estate",
    "Materials": "Materials",
    "Basic Materials": "Materials",
}

CANONICAL_TO_DISPLAY_SECTOR = {
    "Materials": "Materials",
    "Consumer Discretionary": "Discretionary",
    "Financials": "Financials",
    "Real Estate": "Real Estate",
    "Communication Services": "Communications",
    "Energy": "Energy",
    "Industrials": "Industrials",
    "Information Technology": "Technology",
    "Consumer Staples": "Staples",
    "Health Care": "Health Care",
    "Utilities": "Utilities",
}

FIXED_SECTOR_ORDER = [
    "Materials",
    "Consumer Discretionary",
    "Financials",
    "Real Estate",
    "Communication Services",
    "Energy",
    "Industrials",
    "Information Technology",
    "Consumer Staples",
    "Health Care",
    "Utilities",
]

US_SECTOR_BENCHMARK_ETF = {
    "Materials": "XLB",
    "Consumer Discretionary": "XLY",
    "Financials": "XLF",
    "Real Estate": "XLRE",
    "Communication Services": "XLC",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Information Technology": "XLK",
    "Consumer Staples": "XLP",
    "Health Care": "XLV",
    "Utilities": "XLU",
}

CA_SECTOR_BENCHMARK_ETF = {
    "Financials": "XFN.TO",
    "Energy": "XEG.TO",
    "Materials": "XMA.TO",
    "Industrials": "ZIN.TO",
    "Information Technology": "XIT.TO",
    "Utilities": "XUT.TO",
    "Real Estate": "XRE.TO",
    "Consumer Staples": "XST.TO",
    "Consumer Discretionary": "XCD.TO",
    "Health Care": "XIC.TO",
    "Communication Services": "XIC.TO",
}

OVERVIEW_RANGE_MONTHS = {
    "Q1": {1, 2, 3},
    "Q2": {4, 5, 6},
    "Q3": {7, 8, 9},
    "Q4": {10, 11, 12},
}


def _format_log_context(fields: dict[str, Any]) -> str:
    rendered = [f"{key}={value}" for key, value in fields.items() if value is not None]
    return f" [{', '.join(rendered)}]" if rendered else ""


@contextmanager
def _timed_step(label: str, **fields: Any):
    context = _format_log_context(fields)
    logger.info("workspace step start: %s%s", label, context)
    started_at = perf_counter()
    try:
        yield
    finally:
        logger.info("workspace step end: %s in %.3fs%s", label, perf_counter() - started_at, context)


def load_workspace_nav_data() -> dict[str, dict[pd.Timestamp, float]]:
    """Load and merge every NAV source used by the live app."""
    manual_navs = load_manual_navs_json("data/manual_navs.json")
    csv_navs = {}
    try:
        csv_navs = load_historic_nav_csvs("data/historic_navs")
    except Exception as exc:  # pragma: no cover - operational warning only
        logger.warning("Could not load historic NAV CSVs: %s", exc)
    return merge_nav_sources(manual_navs, csv_navs)


def _normalize_close_frame(downloaded: pd.DataFrame | pd.Series, tickers: list[str]) -> pd.DataFrame:
    return extract_download_price_frame(downloaded, tickers)


def _prime_price_cache_for_dates(
    tickers: list[str],
    boundary_dates: list[pd.Timestamp],
    cache: dict,
) -> None:
    normalized_tickers = sorted({
        ticker.strip().upper()
        for ticker in tickers
        if isinstance(ticker, str) and ticker.strip() and ticker != CASH_TICKER
    })
    normalized_dates = sorted({_normalize_timestamp(date) for date in boundary_dates if date is not None})
    if not normalized_tickers or not normalized_dates:
        return

    missing_dates_by_ticker: dict[str, list[pd.Timestamp]] = {}
    for ticker in normalized_tickers:
        missing_dates = [
            date
            for date in normalized_dates
            if build_history_close_cache_key(ticker, date) not in cache
        ]
        if missing_dates:
            missing_dates_by_ticker[ticker] = missing_dates

    if not missing_dates_by_ticker:
        logger.info(
            "workspace price prefetch skipped: cache already warm for %s tickers and %s dates",
            len(normalized_tickers),
            len(normalized_dates),
        )
        return

    fetch_list = sorted(missing_dates_by_ticker)
    start_date = normalized_dates[0] - pd.Timedelta(days=14)
    end_date = normalized_dates[-1] + pd.Timedelta(days=1)

    local_closes = load_local_close_frame(fetch_list)
    local_closes = local_closes.loc[:, ~local_closes.columns.duplicated(keep="first")] if not local_closes.empty else local_closes
    missing_fetch_list = [ticker for ticker in fetch_list if ticker not in local_closes.columns]

    downloaded_closes = pd.DataFrame()
    if missing_fetch_list:
        with _timed_step(
            "price-cache-prime.download",
            tickers=len(missing_fetch_list),
            dates=len(normalized_dates),
            missing_pairs=sum(len(dates) for dates in missing_dates_by_ticker.values()),
            start=start_date.strftime("%Y-%m-%d"),
            end=end_date.strftime("%Y-%m-%d"),
        ):
            try:
                downloaded = yf.download(
                    missing_fetch_list,
                    start=start_date,
                    end=end_date,
                    interval="1d",
                    progress=False,
                    timeout=5,
                    threads=False,
                    auto_adjust=False,
                )
                downloaded_closes = _normalize_close_frame(downloaded, missing_fetch_list)
            except Exception as exc:
                logger.warning("workspace price prefetch download failed: %s", exc)
                downloaded_closes = pd.DataFrame()

    closes_parts = [frame for frame in [local_closes, downloaded_closes] if not frame.empty]
    if not closes_parts:
        logger.warning("workspace price prefetch returned no market data")
        return

    closes = pd.concat(closes_parts, axis=1)
    closes = closes.loc[:, ~closes.columns.duplicated(keep="first")]
    closes.index = pd.to_datetime(closes.index).normalize()
    populated_entries = 0

    for ticker, requested_dates in missing_dates_by_ticker.items():
        if ticker not in closes.columns:
            logger.warning("workspace price prefetch missing ticker: %s", ticker)
            continue

        series = closes[ticker].dropna()
        if series.empty:
            continue

        for boundary_date in requested_dates:
            eligible = series.loc[series.index <= boundary_date]
            if eligible.empty:
                continue

            prior_date = eligible.index[-1]
            if (boundary_date - prior_date).days > PRICE_HISTORY_LOOKBACK_WINDOW_DAYS:
                continue

            price = eligible.iloc[-1]
            if price is None or pd.isna(price):
                continue
            cache[build_history_close_cache_key(ticker, boundary_date)] = float(price)
            populated_entries += 1

    logger.info(
        "workspace price prefetch populated %s cache entries for %s tickers",
        populated_entries,
        len(fetch_list),
    )


def normalize_company_name(raw_name: str | None) -> str | None:
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

    return cleaned or original


def resolve_company_name_from_info(info: dict[str, Any]) -> str | None:
    for key in ("shortName", "displayName", "longName", "name"):
        name = normalize_company_name(info.get(key))
        if name:
            return name
    return None


def get_company_name_map(
    tickers: list[str],
    mutual_fund_tickers: set[str],
    cash_tickers: set[str],
) -> dict[str, str]:
    cache_file = resolve_storage_path("data/company_names_cache.json")
    server_cache: dict[str, str] = {}

    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
            if isinstance(loaded, dict):
                for key, value in loaded.items():
                    if isinstance(key, str) and isinstance(value, str):
                        normalized_value = normalize_company_name(value)
                        if normalized_value:
                            server_cache[key.upper()] = normalized_value
        except Exception as exc:  # pragma: no cover
            logger.warning("Failed to load company name cache: %s", exc)

    unique_tickers = sorted({
        ticker.strip().upper()
        for ticker in tickers
        if isinstance(ticker, str) and ticker.strip()
    })
    missing = [
        ticker
        for ticker in unique_tickers
        if ticker not in server_cache
        and ticker not in mutual_fund_tickers
        and ticker not in cash_tickers
    ]

    if missing:
        logger.info(
            "workspace company names missing from cache for %s tickers; skipping network enrichment during workspace build",
            len(missing),
        )

    return {ticker: server_cache[ticker] for ticker in unique_tickers if ticker in server_cache}


def _normalize_timestamp(value: Any) -> pd.Timestamp:
    return pd.Timestamp(value).normalize()


def _parse_percent_weight(raw_weight: Any) -> float:
    if raw_weight is None:
        return 0.0
    if isinstance(raw_weight, str):
        return float(raw_weight.replace("%", "").strip() or 0.0)
    return float(raw_weight)


def _serialize_timestamp(value: pd.Timestamp | None) -> str | None:
    if value is None:
        return None
    return _normalize_timestamp(value).strftime("%Y-%m-%d")


def _serialize_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    return float(value)


def _serialize_period_key(start: pd.Timestamp | None, end: pd.Timestamp | None) -> str | None:
    start_str = _serialize_timestamp(start)
    end_str = _serialize_timestamp(end)
    if start_str is None or end_str is None:
        return None
    return f"{start_str}|{end_str}"


def _read_storage_json(relative_path: str, default: Any) -> Any:
    path = resolve_storage_path(relative_path)
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:  # pragma: no cover - operational warning only
        logger.warning("Could not load %s: %s", relative_path, exc)
        return default


def _normalize_custom_sectors(raw: dict[str, Any]) -> dict[str, dict[str, float]]:
    normalized: dict[str, dict[str, float]] = {}
    for ticker, weights in raw.items():
        if not isinstance(ticker, str) or not isinstance(weights, dict):
            continue
        clean_weights: dict[str, float] = {}
        for sector, raw_weight in weights.items():
            if not isinstance(sector, str):
                continue
            try:
                clean_weights[sector] = float(raw_weight)
            except (TypeError, ValueError):
                continue
        normalized[ticker.upper()] = clean_weights
    return normalized


def _load_sector_cache_map() -> dict[str, str]:
    raw = _read_storage_json("data/sectors_cache.json", {})
    if not isinstance(raw, dict):
        return {}
    return {
        str(ticker).upper(): str(sector)
        for ticker, sector in raw.items()
        if isinstance(ticker, str) and isinstance(sector, str)
    }


def _load_index_exposure_sectors() -> list[dict[str, float | str]]:
    raw = _read_storage_json("data/index_exposure.json", {})
    if not isinstance(raw, dict):
        return []

    acwi = raw.get("ACWI", {}) if isinstance(raw.get("ACWI"), dict) else {}
    tsx = raw.get("TSX", {}) if isinstance(raw.get("TSX"), dict) else {}
    acwi_sectors = acwi.get("Sectors", {}) if isinstance(acwi.get("Sectors"), dict) else {}
    tsx_sectors = tsx.get("Sectors", {}) if isinstance(tsx.get("Sectors"), dict) else {}

    sector_rows = []
    for sector in sorted(set(acwi_sectors.keys()) | set(tsx_sectors.keys())):
        try:
            weight_acwi = float(acwi_sectors.get(sector, 0.0))
            weight_tsx = float(tsx_sectors.get(sector, 0.0))
        except (TypeError, ValueError):
            continue

        sector_rows.append(
            {
                "sector": sector,
                "ACWI": weight_acwi,
                "TSX": weight_tsx,
                "Index": round((weight_acwi * 0.75) + (weight_tsx * 0.25), 2),
            }
        )

    return sorted(sector_rows, key=lambda row: float(row["Index"]), reverse=True)


def _load_sector_history_cache() -> dict[str, Any]:
    raw = _read_storage_json("data/sector_history_cache.json", {})
    if not isinstance(raw, dict):
        return {"US": {}, "CA": {}, "OVERALL": {}}
    return {
        "US": raw.get("US", {}) if isinstance(raw.get("US"), dict) else {},
        "CA": raw.get("CA", {}) if isinstance(raw.get("CA"), dict) else {},
        "OVERALL": raw.get("OVERALL", {}) if isinstance(raw.get("OVERALL"), dict) else {},
    }


def _canonicalize_sector_name(raw_sector: str | None) -> str | None:
    if not isinstance(raw_sector, str):
        return None
    return SECTOR_NAME_ALIASES.get(raw_sector, raw_sector if raw_sector in FIXED_SECTOR_ORDER else None)


def _compute_series_return(points: Any, start_date: pd.Timestamp, end_date: pd.Timestamp) -> float | None:
    if not isinstance(points, list):
        return None

    filtered_points: list[tuple[pd.Timestamp, float]] = []
    for point in points:
        if not isinstance(point, dict):
            continue
        date_value = point.get("date")
        value = point.get("value")
        if date_value is None or value in (None, 0):
            continue
        try:
            point_date = _normalize_timestamp(date_value)
            point_value = float(value)
        except (TypeError, ValueError):
            continue
        if start_date <= point_date <= end_date:
            filtered_points.append((point_date, point_value))

    if len(filtered_points) < 2:
        return None

    start_value = filtered_points[0][1]
    end_value = filtered_points[-1][1]
    if start_value == 0:
        return None
    return ((end_value / start_value) - 1.0) * 100.0


def _build_portfolio_span_return(
    holding_facts: pd.DataFrame,
    span: tuple[pd.Timestamp, pd.Timestamp],
) -> float:
    span_facts = holding_facts[
        (holding_facts["StartDate"] >= span[0])
        & (holding_facts["EndDate"] <= span[1])
    ].copy()
    if span_facts.empty:
        return 0.0

    period_returns = [
        float(period_facts["Contrib"].sum()) / 100.0
        for _, period_facts in span_facts.groupby("PeriodIndex", sort=True)
    ]
    return float(geometric_chain(period_returns)) * 100.0 if period_returns else 0.0


def _group_periods_by_end_month(periods: list[tuple[pd.Timestamp, pd.Timestamp]]) -> dict[tuple[int, int], list[tuple[int, tuple[pd.Timestamp, pd.Timestamp]]]]:
    month_groups: dict[tuple[int, int], list[tuple[int, tuple[pd.Timestamp, pd.Timestamp]]]] = {}
    for period_idx, period in enumerate(periods):
        month_key = (period[1].year, period[1].month)
        month_groups.setdefault(month_key, []).append((period_idx, period))
    return month_groups


def _trim_month_keys_to_reporting_window(month_keys: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not month_keys:
        return []
    first_january_idx = next((idx for idx, (_, month) in enumerate(month_keys) if month == 1), 0)
    return month_keys[first_january_idx:]


def _group_months_by_quarter(month_keys: list[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    return [month_keys[index:index + 3] for index in range(0, len(month_keys), 3)]


def _build_monthly_periods(periods: list[tuple[pd.Timestamp, pd.Timestamp]]) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    monthly_periods = []
    for _, month_periods in sorted(_group_periods_by_end_month(periods).items()):
        ordered_periods = sorted(month_periods, key=lambda item: item[1][0])
        if not ordered_periods:
            continue
        monthly_periods.append((ordered_periods[0][1][0], ordered_periods[-1][1][1]))
    return monthly_periods


def _build_input_state(items: list[Any], nav_dict: dict[str, dict[pd.Timestamp, float]]) -> dict[str, Any]:
    weights_dict: dict[str, dict[pd.Timestamp, float]] = {}
    imported_dates: set[pd.Timestamp] = set()
    ticker_flags: dict[str, dict[str, bool]] = {}

    for item in items:
        ticker = str(getattr(item, "ticker", "")).upper().strip()
        if not ticker or "TICKER" in ticker:
            continue

        date_value = getattr(item, "date", None)
        if not date_value:
            continue

        timestamp = _normalize_timestamp(date_value)
        imported_dates.add(timestamp)
        weights_dict.setdefault(ticker, {})[timestamp] = _parse_percent_weight(getattr(item, "weight", 0.0))

        flags = ticker_flags.setdefault(ticker, {"isMutualFund": False, "isEtf": False, "isCash": False})
        flags["isMutualFund"] = bool(flags["isMutualFund"] or getattr(item, "isMutualFund", False))
        flags["isEtf"] = bool(flags["isEtf"] or getattr(item, "isEtf", False))
        flags["isCash"] = bool(flags["isCash"] or getattr(item, "isCash", False) or is_cash_ticker(ticker))

    if not imported_dates:
        raise ValueError("No valid dates found in data")

    mutual_fund_tickers = {
        ticker
        for ticker, flags in ticker_flags.items()
        if flags["isMutualFund"] or ticker in nav_dict
    }
    etf_tickers = {ticker for ticker, flags in ticker_flags.items() if flags["isEtf"]}
    cash_tickers = {ticker for ticker, flags in ticker_flags.items() if flags["isCash"]}

    for ticker in mutual_fund_tickers:
        ticker_flags.setdefault(ticker, {"isMutualFund": True, "isEtf": False, "isCash": False})
        ticker_flags[ticker]["isMutualFund"] = True

    return {
        "weights": weights_dict,
        "dates": sorted(imported_dates),
        "ticker_flags": ticker_flags,
        "mutual_fund_tickers": mutual_fund_tickers,
        "etf_tickers": etf_tickers,
        "cash_tickers": cash_tickers,
    }


def _build_price_map(
    weights_dict: dict[str, dict[pd.Timestamp, float]],
    boundary_dates: list[pd.Timestamp],
    nav_dict: dict[str, dict[pd.Timestamp, float]],
    cache: dict,
) -> dict[str, dict[pd.Timestamp, float | None]]:
    prices: dict[str, dict[pd.Timestamp, float | None]] = {}

    for ticker in sorted(weights_dict.keys()):
        if ticker == CASH_TICKER:
            continue
        prices[ticker] = {}
        for boundary_date in boundary_dates:
            normalized_date = _normalize_timestamp(boundary_date)
            if ticker in nav_dict:
                prices[ticker][normalized_date] = get_nav_price_on_or_before(ticker, normalized_date, nav_dict)
            else:
                prices[ticker][normalized_date] = get_price_on_date(ticker, normalized_date, cache)
    return prices


def _build_holding_facts(
    weights_dict: dict[str, dict[pd.Timestamp, float]],
    nav_dict: dict[str, dict[pd.Timestamp, float]],
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    prices: dict[str, dict[pd.Timestamp, float | None]],
    mutual_fund_tickers: set[str],
    cache: dict,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []

    for ticker in sorted(weights_dict.keys()):
        for period_idx, period in enumerate(periods):
            start_date, end_date = period
            weight = float(weights_dict.get(ticker, {}).get(start_date, 0.0))

            if ticker == CASH_TICKER:
                rows.append(
                    {
                        "Ticker": ticker,
                        "PeriodIndex": period_idx,
                        "StartDate": start_date,
                        "EndDate": end_date,
                        "Weight": weight,
                        "PriceStart": None,
                        "PriceEnd": None,
                        "NeedsFx": False,
                        "FxReturn": 0.0,
                        "Return": 0.0,
                        "Contrib": 0.0,
                        "PriceCovered": True,
                    }
                )
                continue

            price_start = prices.get(ticker, {}).get(start_date)
            price_end = prices.get(ticker, {}).get(end_date)
            covered = price_start not in (None, 0) and price_end is not None

            if covered:
                raw_return = price_return(price_start, price_end)
                needs_fx = needs_fx_adjustment(
                    ticker,
                    is_mutual_fund=ticker in mutual_fund_tickers,
                    nav_dict=nav_dict,
                )
                fx_return = get_fx_return(start_date, end_date, cache) if needs_fx else 0.0
                period_return = apply_fx_adjustment(raw_return, fx_return, needs_fx)
                contribution = weight * float(period_return)
            else:
                needs_fx = False
                fx_return = 0.0
                period_return = 0.0
                contribution = 0.0

            rows.append(
                {
                    "Ticker": ticker,
                    "PeriodIndex": period_idx,
                    "StartDate": start_date,
                    "EndDate": end_date,
                    "Weight": weight,
                    "PriceStart": price_start,
                    "PriceEnd": price_end,
                    "NeedsFx": needs_fx,
                    "FxReturn": fx_return,
                    "Return": float(period_return),
                    "Contrib": float(contribution),
                    "PriceCovered": covered,
                }
            )

    facts = pd.DataFrame(rows)
    if not facts.empty:
        facts = facts.sort_values(["Ticker", "PeriodIndex"]).reset_index(drop=True)
    return facts


def _build_period_dataframe(
    holding_facts: pd.DataFrame,
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
) -> pd.DataFrame:
    rows = []
    for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True):
        ordered_facts = ticker_facts.sort_values("PeriodIndex")
        row: dict[str, Any] = {"Ticker": ticker}
        weight_returns: list[tuple[float, float]] = []

        for _, fact in ordered_facts.iterrows():
            period_idx = int(fact["PeriodIndex"])
            row[f"Weight_{period_idx}"] = float(fact["Weight"])
            row[f"Return_{period_idx}"] = float(fact["Return"])
            row[f"Contrib_{period_idx}"] = float(fact["Contrib"])
            weight_returns.append((float(fact["Weight"]), float(fact["Return"])))

        row["YTD_Return"] = 0.0 if ticker == CASH_TICKER else geometric_chain(fact["Return"] for _, fact in ordered_facts.iterrows())
        row["YTD_Contrib"] = 0.0 if ticker == CASH_TICKER else forward_compounded_contribution(weight_returns)
        rows.append(row)

    period_df = pd.DataFrame(rows)
    if not period_df.empty and "YTD_Contrib" in period_df.columns:
        period_df = period_df.sort_values("YTD_Contrib", ascending=False).reset_index(drop=True)
    return period_df


def _select_facts_in_span(
    ticker_facts: pd.DataFrame,
    span: tuple[pd.Timestamp, pd.Timestamp],
) -> pd.DataFrame:
    span_start, span_end = span
    return ticker_facts[
        (ticker_facts["StartDate"] >= span_start)
        & (ticker_facts["EndDate"] <= span_end)
    ].copy()


def _build_monthly_dataframe(
    holding_facts: pd.DataFrame,
    monthly_periods: list[tuple[pd.Timestamp, pd.Timestamp]],
) -> pd.DataFrame:
    rows = []
    for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True):
        ordered_facts = ticker_facts.sort_values("PeriodIndex")
        row: dict[str, Any] = {"Ticker": ticker}

        for period_idx, monthly_period in enumerate(monthly_periods):
            span_facts = _select_facts_in_span(ordered_facts, monthly_period)
            if span_facts.empty or ticker == CASH_TICKER:
                span_return = 0.0
                span_contrib = 0.0
            else:
                span_return = geometric_chain(span_facts["Return"].tolist())
                span_contrib = forward_compounded_contribution(list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist())))

            row[f"Return_{period_idx}"] = float(span_return)
            row[f"Contrib_{period_idx}"] = float(span_contrib)

        if ticker == CASH_TICKER:
            row["YTD_Return"] = 0.0
            row["YTD_Contrib"] = 0.0
        else:
            row["YTD_Return"] = geometric_chain(row.get(f"Return_{idx}", 0.0) for idx in range(len(monthly_periods)))
            row["YTD_Contrib"] = forward_compounded_contribution(list(zip(ordered_facts["Weight"].tolist(), ordered_facts["Return"].tolist())))
        rows.append(row)

    monthly_df = pd.DataFrame(rows)
    if not monthly_df.empty and "YTD_Contrib" in monthly_df.columns:
        monthly_df = monthly_df.sort_values("YTD_Contrib", ascending=False).reset_index(drop=True)
    return monthly_df


def _compute_benchmark_span_return(
    ticker: str,
    start_date: pd.Timestamp,
    end_date: pd.Timestamp,
    cache: dict,
) -> float:
    if ticker == FX_TICKER:
        return float(get_fx_return(start_date, end_date, cache))

    price_start = get_price_on_date(ticker, start_date, cache)
    price_end = get_price_on_date(ticker, end_date, cache)
    if price_start in (None, 0) or price_end is None:
        return 0.0

    raw_return = price_return(price_start, price_end)
    if ticker == "^GSPTSE":
        return float(raw_return)
    fx_return = get_fx_return(start_date, end_date, cache)
    return float(apply_fx_adjustment(raw_return, fx_return, True))


def _build_benchmark_lists(
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    monthly_periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    cache: dict,
) -> tuple[dict[str, list[float]], dict[str, list[float]]]:
    period_lists: dict[str, list[float]] = {}
    monthly_lists: dict[str, list[float]] = {}
    for name, ticker in BENCHMARK_TICKERS.items():
        period_lists[name] = [_compute_benchmark_span_return(ticker, start, end, cache) for start, end in periods]
        monthly_lists[name] = [_compute_benchmark_span_return(ticker, start, end, cache) for start, end in monthly_periods]
    return period_lists, monthly_lists


def _serialize_period_sheet(period_df: pd.DataFrame, periods: list[tuple[pd.Timestamp, pd.Timestamp]]) -> list[dict[str, Any]]:
    rows = []
    for _, row in period_df.iterrows():
        rows.append(
            {
                "ticker": row["Ticker"],
                "periods": [
                    {
                        "weight": float(row.get(f"Weight_{idx}", 0.0)),
                        "returnPct": float(row.get(f"Return_{idx}", 0.0)),
                        "contribution": float(row.get(f"Contrib_{idx}", 0.0)),
                    }
                    for idx in range(len(periods))
                ],
                "ytdReturn": float(row.get("YTD_Return", 0.0)),
                "ytdContrib": float(row.get("YTD_Contrib", 0.0)),
            }
        )
    return rows


def _serialize_monthly_sheet(monthly_df: pd.DataFrame, monthly_periods: list[tuple[pd.Timestamp, pd.Timestamp]]) -> list[dict[str, Any]]:
    rows = []
    for _, row in monthly_df.iterrows():
        rows.append(
            {
                "ticker": row["Ticker"],
                "months": [
                    {
                        "returnPct": float(row.get(f"Return_{idx}", 0.0)),
                        "contribution": float(row.get(f"Contrib_{idx}", 0.0)),
                    }
                    for idx in range(len(monthly_periods))
                ],
                "ytdReturn": float(row.get("YTD_Return", 0.0)),
                "ytdContrib": float(row.get("YTD_Contrib", 0.0)),
            }
        )
    return rows


def _serialize_holdings_items(
    holding_facts: pd.DataFrame,
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    ticker_flags: dict[str, dict[str, bool]],
    custom_sectors: dict[str, dict[str, float]],
    company_name_map: dict[str, str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], str | None]:
    period_items: list[dict[str, Any]] = []
    now_ts = pd.Timestamp.now().normalize()

    ordered_facts = holding_facts.sort_values(["PeriodIndex", "Ticker"]).reset_index(drop=True)

    for _, fact in ordered_facts.iterrows():
        period_idx = int(fact["PeriodIndex"])
        start_date_ts, end_date_ts = periods[period_idx]
        display_ts = end_date_ts if end_date_ts <= now_ts else now_ts
        date_str = display_ts.strftime("%Y-%m-%d")
        ticker = str(fact["Ticker"])
        flags = ticker_flags.get(ticker, {})
        is_mutual_fund = bool(flags.get("isMutualFund"))
        is_cash = bool(flags.get("isCash"))

        period_items.append(
            {
                "ticker": ticker,
                "weight": float(fact["Weight"]),
                "date": date_str,
                "periodIndex": period_idx,
                "periodStart": _serialize_timestamp(start_date_ts),
                "periodEnd": _serialize_timestamp(end_date_ts),
                "periodKey": _serialize_period_key(start_date_ts, end_date_ts),
                "returnPct": float(fact["Return"]),
                "contribution": float(fact["Contrib"]),
                "companyName": None if is_mutual_fund or is_cash else company_name_map.get(ticker),
                "sector": "Mixed" if custom_sectors.get(ticker) else None,
                "notes": None,
                "isMutualFund": is_mutual_fund,
                "isEtf": bool(flags.get("isEtf")),
                "isCash": is_cash,
                "sectorWeights": custom_sectors.get(ticker),
                "startPrice": _serialize_float(fact["PriceStart"]),
                "endPrice": _serialize_float(fact["PriceEnd"]),
                "priceCovered": bool(fact["PriceCovered"]),
            }
        )

    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for item in period_items:
        deduped[(item["ticker"], item["date"])] = item
    holding_items = list(deduped.values())

    latest_date = max((item["date"] for item in holding_items), default=None)
    latest_items = [item for item in holding_items if item["date"] == latest_date] if latest_date else []
    return period_items, holding_items, latest_items, latest_date


def _build_span_summary_table(
    holding_facts: pd.DataFrame,
    span: tuple[pd.Timestamp, pd.Timestamp],
) -> list[dict[str, Any]]:
    rows = []
    for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True):
        span_facts = _select_facts_in_span(ticker_facts.sort_values("PeriodIndex"), span)
        if span_facts.empty or ticker == CASH_TICKER:
            weight = float(span_facts["Weight"].iloc[-1]) if not span_facts.empty else 0.0
            span_return = 0.0
            span_contrib = 0.0
        else:
            weight = float(span_facts["Weight"].iloc[-1])
            span_return = geometric_chain(span_facts["Return"].tolist())
            span_contrib = forward_compounded_contribution(list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist())))

        rows.append(
            {
                "ticker": ticker,
                "weight": weight,
                "returnPct": float(span_return),
                "contribution": float(span_contrib),
            }
        )

    return sorted(rows, key=lambda row: row["contribution"], reverse=True)


def _build_top_contributor_layouts(
    holding_facts: pd.DataFrame,
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
) -> list[dict[str, Any]]:
    month_groups = _group_periods_by_end_month(periods)
    month_keys = _trim_month_keys_to_reporting_window(sorted(month_groups.keys()))
    quarter_groups = _group_months_by_quarter(month_keys)
    monthly_tables_by_key: dict[tuple[int, int], dict[str, Any]] = {}

    for month_key in month_keys:
        month_periods = month_groups.get(month_key, [])
        if not month_periods:
            continue
        ordered_month_periods = [period for _, period in sorted(month_periods, key=lambda item: item[1][0])]
        month_span = (ordered_month_periods[0][0], ordered_month_periods[-1][1])
        label = pd.Timestamp(year=month_key[0], month=month_key[1], day=1).strftime("%B %Y")
        monthly_tables_by_key[month_key] = {
            "label": label,
            "rows": _build_span_summary_table(holding_facts, month_span),
        }

    layouts = []
    for quarter_months in quarter_groups:
        monthly_tables = [
            monthly_tables_by_key[month_key]
            for month_key in quarter_months
            if month_key in monthly_tables_by_key
        ]
        quarter_table = None
        if monthly_tables:
            first_month_key = quarter_months[0]
            last_month_key = quarter_months[-1]
            first_periods = [period for _, period in month_groups[first_month_key]]
            last_periods = [period for _, period in month_groups[last_month_key]]
            quarter_span = (first_periods[0][0], last_periods[-1][1])
            quarter_number = ((first_month_key[1] - 1) // 3) + 1
            quarter_table = {
                "label": f"Q{quarter_number}",
                "rows": _build_span_summary_table(holding_facts, quarter_span),
            }
        layouts.append({"monthlyTables": monthly_tables, "quarterTable": quarter_table})

    return layouts


def _build_span_ticker_summary_rows(
    holding_facts: pd.DataFrame,
    span: tuple[pd.Timestamp, pd.Timestamp],
    ticker_flags: dict[str, dict[str, bool]],
    sector_map: dict[str, str],
    company_name_map: dict[str, str],
) -> list[dict[str, Any]]:
    rows = []
    for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True):
        span_facts = _select_facts_in_span(ticker_facts.sort_values("PeriodIndex"), span)
        flags = ticker_flags.get(ticker, {})
        is_cash = bool(flags.get("isCash"))

        if span_facts.empty:
            weight = 0.0
            span_return = 0.0
            span_contrib = 0.0
        elif is_cash:
            weight = float(span_facts["Weight"].iloc[-1])
            span_return = 0.0
            span_contrib = 0.0
        else:
            weight = float(span_facts["Weight"].iloc[-1])
            span_return = float(geometric_chain(span_facts["Return"].tolist()))
            span_contrib = float(
                forward_compounded_contribution(list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist())))
            )

        rows.append(
            {
                "ticker": ticker,
                "weight": weight,
                "latestWeight": float(ticker_facts.sort_values("PeriodIndex")["Weight"].iloc[-1]) if not ticker_facts.empty else 0.0,
                "returnPct": span_return,
                "contribution": span_contrib,
                "isCash": is_cash,
                "isEtf": bool(flags.get("isEtf")),
                "isMutualFund": bool(flags.get("isMutualFund")),
                "sector": sector_map.get(ticker),
                "companyName": company_name_map.get(ticker),
                "region": "CA" if ticker.endswith(".TO") else "US",
            }
        )

    return sorted(rows, key=lambda row: abs(float(row["contribution"])), reverse=True)


def _build_waterfall_layout(
    summary_rows: list[dict[str, Any]],
    portfolio_return: float,
) -> dict[str, Any]:
    contributors = [
        row for row in summary_rows
        if not row.get("isCash") and float(row.get("latestWeight", row["weight"])) > 0.001
    ]
    contributors = sorted(
        contributors,
        key=lambda row: (
            -float(row.get("latestWeight", row["weight"])),
            str(row["ticker"]),
        ),
    )
    top_rows = contributors[:10]
    top_tickers = {str(row["ticker"]) for row in top_rows}
    others_contribution = sum(float(row["contribution"]) for row in contributors if str(row["ticker"]) not in top_tickers)

    bars: list[dict[str, Any]] = []
    running_total = 0.0

    for row in top_rows:
        start_value = running_total
        running_total += float(row["contribution"])
        bars.append(
            {
                "name": row["ticker"],
                "value": [min(start_value, running_total), max(start_value, running_total)],
                "delta": float(row["contribution"]),
                "isTotal": False,
                "weight": float(row.get("latestWeight", row["weight"])),
                "totalReturn": float(row["returnPct"]) * 100.0,
                "sector": row.get("sector"),
                "companyName": row.get("companyName"),
                "isEtf": bool(row.get("isEtf")),
                "isMutualFund": bool(row.get("isMutualFund")),
            }
        )

    if abs(others_contribution) > 0.001 or len(contributors) > len(top_rows):
        start_value = running_total
        running_total += others_contribution
        bars.append(
            {
                "name": "Others",
                "value": [min(start_value, running_total), max(start_value, running_total)],
                "delta": float(others_contribution),
                "isTotal": False,
            }
        )

    bars.append(
        {
            "name": "Total",
            "value": [0.0, float(portfolio_return)],
            "delta": float(portfolio_return),
            "isTotal": True,
        }
    )

    min_value = min((min(bar["value"]) for bar in bars), default=0.0)
    max_value = max((max(bar["value"]) for bar in bars), default=0.0)
    span = max_value - min_value
    buffer = span * 0.15 if span > 0 else 1.0

    return {
        "bars": bars,
        "domain": [min_value - buffer, max_value + buffer],
        "portfolioReturn": float(portfolio_return),
    }


def _build_sector_attribution_layout(
    summary_rows: list[dict[str, Any]],
    span: tuple[pd.Timestamp, pd.Timestamp],
    *,
    region_filter: str,
    benchmark_mode: str,
    benchmark_exposure: list[dict[str, float | str]],
    sector_history: dict[str, Any],
    custom_sectors: dict[str, dict[str, float]],
) -> dict[str, Any]:
    benchmark_weights: dict[str, float] = {}
    for exposure_row in benchmark_exposure:
        canonical_sector = _canonicalize_sector_name(exposure_row.get("sector") if isinstance(exposure_row, dict) else None)
        if not canonical_sector:
            continue

        weight_key = "Index"
        if region_filter == "CA":
            weight_key = "TSX"
        elif region_filter == "US":
            weight_key = "ACWI"

        raw_weight = exposure_row.get(weight_key) if isinstance(exposure_row, dict) else None
        try:
            benchmark_weights[canonical_sector] = float(raw_weight or 0.0)
        except (TypeError, ValueError):
            benchmark_weights[canonical_sector] = 0.0

    sector_groups: dict[str, dict[str, Any]] = {}
    sector_region_weights: dict[str, dict[str, float]] = {}

    for row in summary_rows:
        if row.get("isCash") or row.get("isEtf") or row.get("isMutualFund"):
            continue
        if region_filter == "CA" and row["region"] != "CA":
            continue
        if region_filter == "US" and row["region"] != "US":
            continue

        canonical_sector = _canonicalize_sector_name(row.get("sector")) or "Other"
        sector_groups.setdefault(
            canonical_sector,
            {"stocks": [], "sumWeight": 0.0, "stockOnlyWeight": 0.0, "stockOnlyWeightedReturn": 0.0},
        )
        sector_region_weights.setdefault(canonical_sector, {"usWeight": 0.0, "caWeight": 0.0})

        period_return = float(row["returnPct"]) * 100.0
        weight = float(row["weight"])

        sector_groups[canonical_sector]["stocks"].append(
            {"ticker": row["ticker"], "returnPct": period_return, "weight": weight}
        )
        sector_groups[canonical_sector]["sumWeight"] += weight
        sector_groups[canonical_sector]["stockOnlyWeight"] += weight
        sector_groups[canonical_sector]["stockOnlyWeightedReturn"] += period_return * weight

        if row["region"] == "CA":
            sector_region_weights[canonical_sector]["caWeight"] += weight
        else:
            sector_region_weights[canonical_sector]["usWeight"] += weight

    for row in summary_rows:
        if row.get("isCash") or (not row.get("isEtf") and not row.get("isMutualFund")):
            continue
        if region_filter == "CA" and row["region"] != "CA":
            continue
        if region_filter == "US" and row["region"] != "US":
            continue

        sector_breakdown = custom_sectors.get(str(row["ticker"]).upper(), {})
        if not isinstance(sector_breakdown, dict):
            continue

        for raw_sector, raw_pct in sector_breakdown.items():
            canonical_sector = _canonicalize_sector_name(raw_sector)
            if not canonical_sector:
                continue
            try:
                pct = float(raw_pct)
            except (TypeError, ValueError):
                continue

            distributed_weight = float(row["weight"]) * (pct / 100.0)
            sector_groups.setdefault(
                canonical_sector,
                {"stocks": [], "sumWeight": 0.0, "stockOnlyWeight": 0.0, "stockOnlyWeightedReturn": 0.0},
            )
            sector_region_weights.setdefault(canonical_sector, {"usWeight": 0.0, "caWeight": 0.0})
            sector_groups[canonical_sector]["sumWeight"] += distributed_weight
            if row["region"] == "CA":
                sector_region_weights[canonical_sector]["caWeight"] += distributed_weight
            else:
                sector_region_weights[canonical_sector]["usWeight"] += distributed_weight

    us_sector_returns = {
        sector: _compute_series_return(points, span[0], span[1])
        for sector, points in (sector_history.get("US", {}) if isinstance(sector_history.get("US"), dict) else {}).items()
    }
    ca_sector_returns = {
        sector: _compute_series_return(points, span[0], span[1])
        for sector, points in (sector_history.get("CA", {}) if isinstance(sector_history.get("CA"), dict) else {}).items()
    }

    overall_key = "SP500" if benchmark_mode == "SP500" else "TSX"
    overall_benchmark_return = _compute_series_return(
        (sector_history.get("OVERALL", {}) if isinstance(sector_history.get("OVERALL"), dict) else {}).get(overall_key, []),
        span[0],
        span[1],
    )

    effective_benchmark_returns: dict[str, float] = {}
    blended_benchmark_labels: dict[str, str] = {}

    if benchmark_mode != "SECTOR":
        if overall_benchmark_return is not None:
            for sector in FIXED_SECTOR_ORDER:
                effective_benchmark_returns[sector] = overall_benchmark_return
    elif region_filter == "ALL":
        for sector in FIXED_SECTOR_ORDER:
            us_return = us_sector_returns.get(sector)
            ca_return = ca_sector_returns.get(sector)
            region_weights = sector_region_weights.get(sector, {"usWeight": 0.0, "caWeight": 0.0})
            total_weight = region_weights["usWeight"] + region_weights["caWeight"]
            if total_weight < 0.001:
                if us_return is not None:
                    effective_benchmark_returns[sector] = us_return
                    blended_benchmark_labels[sector] = US_SECTOR_BENCHMARK_ETF.get(sector, "SPY")
                elif ca_return is not None:
                    effective_benchmark_returns[sector] = ca_return
                    blended_benchmark_labels[sector] = CA_SECTOR_BENCHMARK_ETF.get(sector, "XIC.TO")
                continue

            us_fraction = region_weights["usWeight"] / total_weight
            ca_fraction = region_weights["caWeight"] / total_weight
            if us_return is not None and ca_return is not None and us_fraction > 0.001 and ca_fraction > 0.001:
                effective_benchmark_returns[sector] = (us_fraction * us_return) + (ca_fraction * ca_return)
                blended_benchmark_labels[sector] = (
                    f"{round(us_fraction * 100)}% {US_SECTOR_BENCHMARK_ETF.get(sector, 'SPY')} + "
                    f"{round(ca_fraction * 100)}% {CA_SECTOR_BENCHMARK_ETF.get(sector, 'XIC.TO')}"
                )
            elif ca_return is not None and ca_fraction > 0.999:
                effective_benchmark_returns[sector] = ca_return
                blended_benchmark_labels[sector] = CA_SECTOR_BENCHMARK_ETF.get(sector, "XIC.TO")
            elif us_return is not None:
                effective_benchmark_returns[sector] = us_return
                blended_benchmark_labels[sector] = US_SECTOR_BENCHMARK_ETF.get(sector, "SPY")
            elif ca_return is not None:
                effective_benchmark_returns[sector] = ca_return
                blended_benchmark_labels[sector] = CA_SECTOR_BENCHMARK_ETF.get(sector, "XIC.TO")
    else:
        region_series = ca_sector_returns if region_filter == "CA" else us_sector_returns
        for sector in FIXED_SECTOR_ORDER:
            if region_series.get(sector) is not None:
                effective_benchmark_returns[sector] = float(region_series[sector])

    total_benchmark_return_sum = 0.0
    total_benchmark_weight = 0.0
    for sector, benchmark_weight in benchmark_weights.items():
        benchmark_return = effective_benchmark_returns.get(sector)
        if benchmark_return is None:
            continue
        total_benchmark_return_sum += benchmark_weight * benchmark_return
        total_benchmark_weight += benchmark_weight
    total_benchmark_return = (total_benchmark_return_sum / total_benchmark_weight) if total_benchmark_weight > 0 else 0.0

    overall_benchmark_label = None
    if benchmark_mode == "SP500":
        overall_benchmark_label = "SPY"
    elif benchmark_mode == "TSX":
        overall_benchmark_label = "XIC.TO"

    chart_rows: list[dict[str, Any]] = []
    for sector in FIXED_SECTOR_ORDER:
        group = sector_groups.get(sector, {"stocks": [], "sumWeight": 0.0, "stockOnlyWeight": 0.0, "stockOnlyWeightedReturn": 0.0})
        benchmark_weight = float(benchmark_weights.get(sector, 0.0))
        benchmark_return = float(effective_benchmark_returns.get(sector, 0.0))
        if group["sumWeight"] <= 0.001 and benchmark_weight <= 0:
            continue

        has_direct_holdings = group["stockOnlyWeight"] > 0.001
        stock_return = (
            group["stockOnlyWeightedReturn"] / group["stockOnlyWeight"]
            if has_direct_holdings else 0.0
        )
        selection_effect = (benchmark_weight * (stock_return - benchmark_return)) / 100.0 if has_direct_holdings else 0.0
        allocation_effect = (
            ((group["sumWeight"] - benchmark_weight) * (benchmark_return - total_benchmark_return)) / 100.0
            if benchmark_mode == "SECTOR" else 0.0
        )
        interaction_effect = (
            ((group["sumWeight"] - benchmark_weight) * (stock_return - benchmark_return)) / 100.0
            if has_direct_holdings else 0.0
        )

        chart_rows.append(
            {
                "sector": sector,
                "displayName": CANONICAL_TO_DISPLAY_SECTOR.get(sector, sector),
                "benchmarkETF": overall_benchmark_label
                or blended_benchmark_labels.get(sector)
                or (CA_SECTOR_BENCHMARK_ETF.get(sector) if region_filter == "CA" else US_SECTOR_BENCHMARK_ETF.get(sector))
                or "-",
                "selectionEffect": selection_effect,
                "allocationEffect": allocation_effect,
                "interactionEffect": interaction_effect,
                "benchmarkReturn": benchmark_return,
                "benchmarkWeight": benchmark_weight,
                "portfolioWeight": float(group["sumWeight"]),
                "portfolioReturn": stock_return if has_direct_holdings else 0.0,
                "hasDirectHoldings": has_direct_holdings,
                "stocks": [
                    {
                        "ticker": stock["ticker"],
                        "returnPct": float(stock["returnPct"]),
                        "weight": float(stock["weight"]),
                        "selectionContribution": (
                            (benchmark_weight * float(stock["weight"]) * (float(stock["returnPct"]) - benchmark_return))
                            / (float(group["stockOnlyWeight"]) * 100.0)
                            if has_direct_holdings else 0.0
                        ),
                    }
                    for stock in group["stocks"]
                ],
            }
        )

    max_selection = max((abs(float(row["selectionEffect"])) for row in chart_rows), default=1.0)
    max_allocation = max((abs(float(row["allocationEffect"])) for row in chart_rows), default=1.0)
    max_interaction = max((abs(float(row["interactionEffect"])) for row in chart_rows), default=1.0)

    return {
        "data": chart_rows,
        "selectionDomain": [-max(max_selection * 1.5, 0.01), max(max_selection * 1.5, 0.01)],
        "allocationDomain": [-max(max_allocation * 1.5, 0.01), max(max_allocation * 1.5, 0.01)],
        "interactionDomain": [-max(max_interaction * 1.5, 0.01), max(max_interaction * 1.5, 0.01)],
    }


def _build_attribution_overview_layouts(
    holding_facts: pd.DataFrame,
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    ticker_flags: dict[str, dict[str, bool]],
    custom_sectors: dict[str, dict[str, float]],
    company_name_map: dict[str, str],
) -> dict[str, Any]:
    if holding_facts.empty or not periods:
        return {}

    month_groups = _group_periods_by_end_month(periods)
    month_keys = _trim_month_keys_to_reporting_window(sorted(month_groups.keys()))
    if not month_keys:
        return {}

    sector_map = _load_sector_cache_map()
    benchmark_exposure = _load_index_exposure_sectors()
    sector_history = _load_sector_history_cache()
    layouts: dict[str, Any] = {}

    years = sorted({year for year, _ in month_keys})
    for year in years:
        year_month_keys = [month_key for month_key in month_keys if month_key[0] == year]
        if not year_month_keys:
            continue

        year_layouts: dict[str, Any] = {}
        range_month_keys: dict[str, list[tuple[int, int]]] = {"YTD": year_month_keys}
        for range_name, quarter_months in OVERVIEW_RANGE_MONTHS.items():
            range_month_keys[range_name] = [month_key for month_key in year_month_keys if month_key[1] in quarter_months]

        for range_name, selected_month_keys in range_month_keys.items():
            if not selected_month_keys:
                continue

            ordered_periods: list[tuple[pd.Timestamp, pd.Timestamp]] = []
            for month_key in selected_month_keys:
                ordered_periods.extend(period for _, period in sorted(month_groups.get(month_key, []), key=lambda item: item[1][0]))
            if not ordered_periods:
                continue

            span = (ordered_periods[0][0], ordered_periods[-1][1])
            summary_rows = _build_span_ticker_summary_rows(
                holding_facts,
                span,
                ticker_flags,
                sector_map,
                company_name_map,
            )
            portfolio_return = _build_portfolio_span_return(holding_facts, span)
            year_layouts[range_name] = {
                "waterfall": _build_waterfall_layout(summary_rows, portfolio_return),
                "sectorAttribution": {
                    region: {
                        benchmark: _build_sector_attribution_layout(
                            summary_rows,
                            span,
                            region_filter=region,
                            benchmark_mode=benchmark,
                            benchmark_exposure=benchmark_exposure,
                            sector_history=sector_history,
                            custom_sectors=custom_sectors,
                        )
                        for benchmark in ("SECTOR", "SP500", "TSX")
                    }
                    for region in ("ALL", "US", "CA")
                },
            }

        if year_layouts:
            layouts[str(year)] = year_layouts

    return layouts


def _build_nav_audit() -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    manual_path = resolve_storage_path("data/manual_navs.json")
    manual_navs = {}
    if manual_path.exists():
        with open(manual_path, "r", encoding="utf-8") as handle:
            manual_navs = json.load(handle)

    csv_navs = {}
    try:
        csv_navs = load_historic_nav_csvs("data/historic_navs")
    except Exception as exc:  # pragma: no cover
        logger.warning("nav audit could not load CSV NAVs: %s", exc)

    all_tickers = set(manual_navs.keys()) | set(csv_navs.keys())
    for ticker in sorted(all_tickers):
        entries: list[dict[str, Any]] = []
        seen_dates: set[str] = set()

        for dt, value in sorted(csv_navs.get(ticker, {}).items()):
            date_str = _serialize_timestamp(dt)
            if not date_str:
                continue
            entries.append({"date": date_str, "nav": round(float(value), 4), "source": "csv"})
            seen_dates.add(date_str)

        for date_str, value in sorted(manual_navs.get(ticker, {}).items()):
            if date_str in seen_dates:
                continue
            entries.append({"date": str(date_str), "nav": round(float(value), 4), "source": "manual"})

        entries.sort(key=lambda entry: entry["date"])
        for idx, entry in enumerate(entries):
            if idx == 0:
                entry["returnPct"] = None
            else:
                prev = entries[idx - 1]["nav"]
                entry["returnPct"] = None if prev in (None, 0) else round((entry["nav"] - prev) / prev * 100, 4)
        result[ticker] = entries

    return result


def _build_mf_traces(
    holding_facts: pd.DataFrame,
    monthly_periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    periods: list[tuple[pd.Timestamp, pd.Timestamp]],
    prices: dict[str, dict[pd.Timestamp, float | None]],
    nav_dict: dict[str, dict[pd.Timestamp, float]],
    boundary_dates: list[pd.Timestamp],
) -> dict[str, dict[str, Any]]:
    traces: dict[str, dict[str, Any]] = {}
    month_groups = _group_periods_by_end_month(periods)
    month_keys = _trim_month_keys_to_reporting_window(sorted(month_groups.keys()))
    quarter_groups = _group_months_by_quarter(month_keys)

    for ticker in sorted(set(nav_dict.keys()) & set(holding_facts["Ticker"].unique())):
        ticker_facts = holding_facts.loc[holding_facts["Ticker"] == ticker].sort_values("PeriodIndex")
        price_series = prices.get(ticker, {})

        monthly_rows = []
        for monthly_period in monthly_periods:
            span_facts = _select_facts_in_span(ticker_facts, monthly_period)
            if span_facts.empty:
                continue
            monthly_rows.append(
                {
                    "label": f"{_serialize_timestamp(monthly_period[0])} -> {_serialize_timestamp(monthly_period[1])}",
                    "startValue": _serialize_float(price_series.get(monthly_period[0])),
                    "endValue": _serialize_float(price_series.get(monthly_period[1])),
                    "returnPct": float(geometric_chain(span_facts["Return"].tolist())),
                    "contribution": float(forward_compounded_contribution(list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist())))),
                }
            )

        quarter_rows = []
        for quarter_months in quarter_groups:
            if not quarter_months:
                continue
            quarter_periods = []
            for month_key in quarter_months:
                quarter_periods.extend(period for _, period in month_groups.get(month_key, []))
            if not quarter_periods:
                continue
            quarter_span = (quarter_periods[0][0], quarter_periods[-1][1])
            span_facts = _select_facts_in_span(ticker_facts, quarter_span)
            if span_facts.empty:
                continue
            quarter_number = ((quarter_months[0][1] - 1) // 3) + 1
            quarter_rows.append(
                {
                    "label": f"Q{quarter_number}",
                    "startValue": _serialize_float(price_series.get(quarter_span[0])),
                    "endValue": _serialize_float(price_series.get(quarter_span[1])),
                    "returnPct": float(geometric_chain(span_facts["Return"].tolist())),
                    "contribution": float(forward_compounded_contribution(list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist())))),
                }
            )

        ytd_return = 0.0 if ticker_facts.empty else float(geometric_chain(ticker_facts["Return"].tolist()))
        ytd_contrib = 0.0 if ticker_facts.empty else float(forward_compounded_contribution(list(zip(ticker_facts["Weight"].tolist(), ticker_facts["Return"].tolist()))))
        traces[ticker] = {
            "rawNavInputs": [
                {"date": _serialize_timestamp(nav_date), "nav": float(nav_value)}
                for nav_date, nav_value in sorted(nav_dict.get(ticker, {}).items(), key=lambda item: _normalize_timestamp(item[0]))
            ],
            "reportingBoundaries": [_serialize_timestamp(boundary) for boundary in boundary_dates],
            "resolvedBoundaryPrices": [
                {"date": _serialize_timestamp(boundary), "value": _serialize_float(price_series.get(boundary))}
                for boundary in boundary_dates
            ],
            "subperiodRows": [
                {
                    "startDate": _serialize_timestamp(fact["StartDate"]),
                    "endDate": _serialize_timestamp(fact["EndDate"]),
                    "weight": float(fact["Weight"]),
                    "priceStart": _serialize_float(fact["PriceStart"]),
                    "priceEnd": _serialize_float(fact["PriceEnd"]),
                    "returnPct": float(fact["Return"]),
                    "contribution": float(fact["Contrib"]),
                    "needsFx": bool(fact["NeedsFx"]),
                    "priceCovered": bool(fact["PriceCovered"]),
                }
                for _, fact in ticker_facts.iterrows()
            ],
            "monthlyRows": monthly_rows,
            "quarterRows": quarter_rows,
            "ytdRow": {
                "startValue": _serialize_float(price_series.get(boundary_dates[0] if boundary_dates else None)),
                "endValue": _serialize_float(price_series.get(boundary_dates[-1] if boundary_dates else None)),
                "returnPct": ytd_return,
                "contribution": ytd_contrib,
            },
        }
    return traces


def _build_performance_section(
    holdings_items: list[dict[str, Any]],
    nav_tickers: set[str],
    nav_dict: dict[str, dict[pd.Timestamp, float]],
    start_date: pd.Timestamp | None = None,
    end_date: pd.Timestamp | None = None,
) -> dict[str, Any]:
    benchmark_names = ["75/25", "TSX", "SP500", "ACWI"]
    timestamp = datetime.now(timezone.utc).isoformat()

    class _SimpleItem:
        def __init__(self, payload: dict[str, Any]):
            self.ticker = payload["ticker"]
            self.weight = payload["weight"]
            self.date = payload["date"]
            self.isMutualFund = payload.get("isMutualFund", False)
            self.isEtf = payload.get("isEtf", False)
            self.isCash = payload.get("isCash", False)

    normalized_items = [_SimpleItem(item) for item in holdings_items]
    period_weights = aggregate_period_weights(normalized_items, nav_tickers=nav_tickers)
    if not period_weights:
        return {"defaultBenchmark": "75/25", "variants": {}, "rollingMetrics": {}}

    all_tickers = list({ticker for _, weights, _ in period_weights for ticker in weights if not is_cash_ticker(ticker)})
    all_mutual_fund_tickers = {ticker for _, _, mf_tickers in period_weights for ticker in mf_tickers}
    try:
        returns_df, _, missing_tickers = fetch_returns_df(
            all_tickers,
            mutual_fund_tickers=all_mutual_fund_tickers,
            nav_dict=nav_dict,
            start_date=start_date,
            end_date=end_date,
        )
        portfolio_returns, extra_missing = build_period_weighted_portfolio_returns(returns_df, period_weights)
    except Exception as exc:
        logger.warning("workspace performance section unavailable: %s", exc)
        return {
            "defaultBenchmark": "75/25",
            "variants": {
                name: {"metrics": {}, "series": [], "missingTickers": sorted(all_tickers), "fetchedAt": timestamp, "error": f"Performance workspace unavailable: {exc}"}
                for name in benchmark_names
            },
            "rollingMetrics": {
                name: {"windows": {21: [], 63: [], 126: []}, "error": f"Performance workspace unavailable: {exc}"}
                for name in benchmark_names
            },
        }
    missing = [ticker for ticker in sorted(set(missing_tickers + extra_missing)) if not is_cash_ticker(ticker)]

    variants: dict[str, Any] = {}
    rolling_metrics: dict[str, Any] = {}
    for benchmark_name in benchmark_names:
        benchmark_returns = build_benchmark_returns(returns_df, benchmark=benchmark_name)
        variant = compute_backcast_metrics(portfolio_returns, benchmark_returns)
        variant["missingTickers"] = missing
        variant["fetchedAt"] = timestamp
        if benchmark_name == "75/25":
            from services.backcast_service import compute_period_attribution

            variant["periodAttribution"] = compute_period_attribution(
                returns_df,
                period_weights,
                nav_tickers=nav_tickers,
            )
        variants[benchmark_name] = variant
        rolling_metrics[benchmark_name] = compute_rolling_metrics(portfolio_returns, benchmark_returns)

    return {
        "defaultBenchmark": "75/25",
        "variants": variants,
        "rollingMetrics": rolling_metrics,
    }


def _build_risk_section(
    latest_items: list[dict[str, Any]],
    nav_tickers: set[str],
    nav_dict: dict[str, dict[pd.Timestamp, float]],
) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat()

    class _SimpleItem:
        def __init__(self, payload: dict[str, Any]):
            self.ticker = payload["ticker"]
            self.weight = payload["weight"]
            self.date = payload["date"]
            self.isMutualFund = payload.get("isMutualFund", False)
            self.isEtf = payload.get("isEtf", False)
            self.isCash = payload.get("isCash", False)

    items = [_SimpleItem(item) for item in latest_items if float(item.get("weight", 0.0)) > 0]
    if not items:
        return {
            "portfolioVol": 0.0,
            "benchmarkVol": 0.0,
            "portfolioBeta": 1.0,
            "diversificationRatio": 0.0,
            "concentrationRatio": 0.0,
            "numEffectiveBets": 0.0,
            "top3Concentration": 0.0,
            "var95": 0.0,
            "cvar95": 0.0,
            "positions": [],
            "sectorRisk": [],
            "missingTickers": [],
            "fetchedAt": timestamp,
        }

    from services.backcast_service import aggregate_weights

    weights_by_ticker, mutual_fund_tickers = aggregate_weights(items, nav_tickers=nav_tickers)
    tradeable_tickers = [ticker for ticker in weights_by_ticker if not is_cash_ticker(ticker)]
    if not tradeable_tickers:
        return {
            "portfolioVol": 0.0,
            "benchmarkVol": 0.0,
            "portfolioBeta": 1.0,
            "diversificationRatio": 0.0,
            "concentrationRatio": 0.0,
            "numEffectiveBets": 0.0,
            "top3Concentration": 0.0,
            "var95": 0.0,
            "cvar95": 0.0,
            "positions": [],
            "sectorRisk": [],
            "missingTickers": [],
            "fetchedAt": timestamp,
        }

    try:
        returns_df, raw_returns_df, _ = fetch_returns_df(
            tradeable_tickers,
            mutual_fund_tickers=mutual_fund_tickers,
            nav_dict=nav_dict,
        )
    except Exception as exc:
        logger.warning("workspace risk section unavailable: %s", exc)
        return {"error": f"Risk workspace unavailable: {exc}", "missingTickers": sorted(tradeable_tickers), "fetchedAt": timestamp}

    ticker_list = []
    weight_vec = []
    missing_tickers = []
    ticker_returns_cols = {}

    for ticker, weight in weights_by_ticker.items():
        if ticker not in returns_df.columns:
            missing_tickers.append(ticker)
            continue
        is_mf = ticker in (mutual_fund_tickers | nav_tickers)
        if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in returns_df.columns:
            fx_ret = returns_df["USDCAD=X"]
            adj_ret = (1 + returns_df[ticker]) * (1 + fx_ret) - 1
        else:
            adj_ret = returns_df[ticker]
        ticker_list.append(ticker)
        weight_vec.append(weight)
        ticker_returns_cols[ticker] = adj_ret

    if not ticker_list:
        return {"error": "No valid tickers with price data", "missingTickers": missing_tickers, "fetchedAt": timestamp}

    returns_matrix = pd.DataFrame(ticker_returns_cols).iloc[1:]
    w = np.array(weight_vec)
    cov_matrix = returns_matrix.cov().values * 252
    port_var = w @ cov_matrix @ w
    port_vol = np.sqrt(port_var) if port_var > 0 else 0.0
    cov_w = cov_matrix @ w
    mctr = cov_w / port_vol if port_vol > 0 else np.zeros(len(w))
    component_risk = w * mctr
    total_component = np.sum(component_risk)
    pct_of_total = component_risk / total_component if total_component > 0 else np.zeros(len(w))
    individual_vols = returns_matrix.std().values * np.sqrt(252)
    annualized_returns = returns_matrix.mean().values * 252

    port_daily_ret = (returns_matrix.values * w).sum(axis=1)
    port_daily_var = np.var(port_daily_ret, ddof=1)
    betas = []
    for idx in range(len(ticker_list)):
        if port_daily_var > 0:
            beta_value = np.cov(returns_matrix.iloc[:, idx].values, port_daily_ret)[0, 1] / port_daily_var
        else:
            beta_value = 1.0
        betas.append(round(float(beta_value), 3))

    sum_weighted_vol = np.sum(w * individual_vols)
    diversification_ratio = sum_weighted_vol / port_vol if port_vol > 0 else 1.0
    hhi = np.sum(pct_of_total ** 2)
    num_effective_bets = 1.0 / hhi if hhi > 0 else len(ticker_list)
    sorted_pct = np.sort(pct_of_total)[::-1]
    top3_concentration = float(np.sum(sorted_pct[:3])) if len(sorted_pct) >= 3 else float(np.sum(sorted_pct))

    benchmark_returns = build_benchmark_returns(returns_df, benchmark="75/25")
    aligned_benchmark = benchmark_returns.reindex(returns_matrix.index).fillna(0.0)
    benchmark_daily = aligned_benchmark.values
    portfolio_daily = port_daily_ret
    benchmark_vol = compute_annualized_vol(benchmark_daily) if len(benchmark_daily) > 1 else 0.0
    portfolio_beta = compute_beta(portfolio_daily, benchmark_daily) if len(portfolio_daily) > 1 and len(benchmark_daily) > 1 else 1.0

    var_threshold = np.percentile(port_daily_ret, 5)
    var_95 = float(abs(var_threshold))
    tail_returns = port_daily_ret[port_daily_ret <= var_threshold]
    cvar_95 = float(abs(np.mean(tail_returns))) if len(tail_returns) > 0 else var_95

    sector_map: dict[str, str] = {}
    sectors_file = resolve_storage_path("data/sectors_cache.json")
    if sectors_file.exists():
        try:
            with open(sectors_file, "r", encoding="utf-8") as handle:
                cached = json.load(handle)
            sector_map.update({key: value for key, value in cached.items() if isinstance(value, str)})
        except Exception as exc:  # pragma: no cover
            logger.warning("Could not load sector cache: %s", exc)

    missing_sector_tickers = [ticker for ticker in ticker_list if ticker not in sector_map]
    if missing_sector_tickers:
        logger.info(
            "workspace risk sector cache missing %s tickers; using fallback sector labels until cache is enriched separately",
            len(missing_sector_tickers),
        )

    positions = []
    for idx, ticker in enumerate(ticker_list):
        risk_adjusted_return = annualized_returns[idx] / individual_vols[idx] if individual_vols[idx] > 0 else 0.0
        positions.append(
            {
                "ticker": ticker,
                "sector": sector_map.get(ticker, "Other"),
                "weight": round(float(w[idx]) * 100, 2),
                "individualVol": round(float(individual_vols[idx]) * 100, 2),
                "beta": betas[idx],
                "mctr": round(float(mctr[idx]) * 100, 4),
                "componentRisk": round(float(component_risk[idx]) * 100, 4),
                "pctOfTotalRisk": round(float(pct_of_total[idx]) * 100, 2),
                "annualizedReturn": round(float(annualized_returns[idx]) * 100, 2),
                "riskAdjustedReturn": round(float(risk_adjusted_return), 2),
            }
        )

    sec_wt_agg: dict[str, float] = {}
    sec_risk_agg: dict[str, float] = {}
    for idx, ticker in enumerate(ticker_list):
        sector = sector_map.get(ticker, "Other")
        sec_wt_agg[sector] = sec_wt_agg.get(sector, 0.0) + float(w[idx])
        sec_risk_agg[sector] = sec_risk_agg.get(sector, 0.0) + float(pct_of_total[idx])

    sector_risk = [
        {
            "sector": sector,
            "weight": round(weight * 100, 2),
            "riskContribution": round(sec_risk_agg.get(sector, 0.0) * 100, 2),
        }
        for sector, weight in sorted(sec_wt_agg.items())
    ]

    correlation_matrix = None
    try:
        sorted_positions = sorted(positions, key=lambda row: -row["pctOfTotalRisk"])[:15]
        corr_tickers = [position["ticker"] for position in sorted_positions]
        raw_corr_cols = {}
        for ticker in corr_tickers:
            if ticker not in raw_returns_df.columns:
                continue
            is_mf = ticker in (mutual_fund_tickers | nav_tickers)
            if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in raw_returns_df.columns:
                fx_ret = raw_returns_df["USDCAD=X"]
                raw_corr_cols[ticker] = (1 + raw_returns_df[ticker]) * (1 + fx_ret) - 1
            else:
                raw_corr_cols[ticker] = raw_returns_df[ticker]

        corr_returns = pd.DataFrame(raw_corr_cols).iloc[1:]
        ewma_cov_panel = corr_returns.ewm(halflife=63, min_periods=21).cov()
        last_ts = ewma_cov_panel.index.get_level_values(0)[-1]
        cov_now = ewma_cov_panel.loc[last_ts].values.astype(float)
        final_tickers = list(ewma_cov_panel.loc[last_ts].index)
        std_now = np.sqrt(np.maximum(np.diag(cov_now), 0.0))
        outer_std = np.outer(std_now, std_now)
        with np.errstate(divide="ignore", invalid="ignore"):
            corr_array = np.where(outer_std > 0, cov_now / outer_std, 0.0)
        corr_array = np.nan_to_num(np.clip(corr_array, -1.0, 1.0), nan=0.0)
        np.fill_diagonal(corr_array, 1.0)
        correlation_matrix = {"tickers": final_tickers, "matrix": np.round(corr_array, 3).tolist()}
    except Exception as exc:  # pragma: no cover
        logger.warning("Could not compute correlation matrix: %s", exc)

    return {
        "portfolioVol": round(float(port_vol) * 100, 2),
        "benchmarkVol": round(float(benchmark_vol) * 100, 2),
        "portfolioBeta": round(float(portfolio_beta), 2),
        "diversificationRatio": round(float(diversification_ratio), 2),
        "concentrationRatio": round(float(hhi), 4),
        "numEffectiveBets": round(float(num_effective_bets), 1),
        "top3Concentration": round(float(top3_concentration) * 100, 1),
        "var95": round(float(var_95) * 100, 2),
        "cvar95": round(float(cvar_95) * 100, 2),
        "positions": positions,
        "sectorRisk": sector_risk,
        "correlationMatrix": correlation_matrix,
        "missingTickers": missing_tickers,
        "fetchedAt": timestamp,
    }


def build_portfolio_workspace(items: list[Any]) -> dict[str, Any]:
    with _timed_step("build_portfolio_workspace.total", items=len(items)):
        with _timed_step("load_workspace_nav_data"):
            nav_dict = load_workspace_nav_data()

        with _timed_step("build_input_state", nav_tickers=len(nav_dict)):
            input_state = _build_input_state(items, nav_dict)

        with _timed_step("normalize_portfolio_periods", snapshots=len(input_state["dates"])):
            expanded_weights, expanded_dates = normalize_portfolio_periods(
                input_state["weights"],
                input_state["dates"],
            )
            periods = list(zip(expanded_dates[:-1], expanded_dates[1:]))
            monthly_periods = _build_monthly_periods(periods)

        with _timed_step("load_cache"):
            cache = load_cache()

        market_lookup_tickers = sorted(
            {
                ticker
                for ticker in expanded_weights.keys()
                if ticker != CASH_TICKER and ticker not in input_state["mutual_fund_tickers"]
            }
            | set(BENCHMARK_TICKERS.values())
        )
        with _timed_step("prime_price_cache_for_dates", tickers=len(market_lookup_tickers), dates=len(expanded_dates)):
            _prime_price_cache_for_dates(market_lookup_tickers, expanded_dates, cache)

        with _timed_step("build_price_map", tickers=len(expanded_weights), dates=len(expanded_dates)):
            prices = _build_price_map(expanded_weights, expanded_dates, nav_dict, cache)

        with _timed_step("build_holding_facts", periods=len(periods)):
            holding_facts = _build_holding_facts(
                expanded_weights,
                nav_dict,
                periods,
                prices,
                input_state["mutual_fund_tickers"],
                cache,
            )

        with _timed_step("build_period_dataframe"):
            period_df = _build_period_dataframe(holding_facts, periods)

        with _timed_step("build_monthly_dataframe", monthly_periods=len(monthly_periods)):
            monthly_df = _build_monthly_dataframe(holding_facts, monthly_periods)

        with _timed_step("build_benchmark_lists", periods=len(periods), monthly_periods=len(monthly_periods)):
            benchmark_returns, benchmark_monthly_returns = _build_benchmark_lists(periods, monthly_periods, cache)

        with _timed_step("load_custom_sectors"):
            custom_sectors_path = resolve_storage_path("data/custom_sectors.json")
            custom_sectors = {}
            if custom_sectors_path.exists():
                try:
                    with open(custom_sectors_path, "r", encoding="utf-8") as handle:
                        custom_sectors = _normalize_custom_sectors(json.load(handle))
                except Exception as exc:  # pragma: no cover
                    logger.warning("Could not load custom sectors: %s", exc)

        with _timed_step("get_company_name_map", tickers=len(expanded_weights)):
            company_name_map = get_company_name_map(
                list(expanded_weights.keys()),
                input_state["mutual_fund_tickers"],
                input_state["cash_tickers"],
            )

        with _timed_step("serialize_holdings_items"):
            period_items, holdings_items, latest_items, latest_holdings_date = _serialize_holdings_items(
                holding_facts,
                periods,
                input_state["ticker_flags"],
                custom_sectors,
                company_name_map,
            )

        with _timed_step("build_portfolio_return_maps"):
            portfolio_period_returns = {
                f"{_serialize_timestamp(period[0])}|{_serialize_timestamp(period[1])}": (
                    float(period_df[f"Contrib_{idx}"].sum()) / 100.0
                    if f"Contrib_{idx}" in period_df.columns else 0.0
                )
                for idx, period in enumerate(periods)
            }
            portfolio_monthly_returns = {}
            for monthly_period in monthly_periods:
                monthly_key = f"{_serialize_timestamp(monthly_period[0])}|{_serialize_timestamp(monthly_period[1])}"
                relevant = [
                    portfolio_period_returns[f"{_serialize_timestamp(period[0])}|{_serialize_timestamp(period[1])}"]
                    for period in periods
                    if period[0] >= monthly_period[0] and period[1] <= monthly_period[1]
                ]
                portfolio_monthly_returns[monthly_key] = float(geometric_chain(relevant)) if relevant else 0.0
            portfolio_ytd_return = float(geometric_chain(portfolio_monthly_returns.values())) if portfolio_monthly_returns else 0.0

        with _timed_step("build_attribution_overview_layouts"):
            overview_layouts = _build_attribution_overview_layouts(
                holding_facts,
                periods,
                input_state["ticker_flags"],
                custom_sectors,
                company_name_map,
            )

        with _timed_step("build_performance_section", holdings=len(holdings_items)):
            performance = _build_performance_section(
                holdings_items,
                set(nav_dict.keys()),
                nav_dict,
                start_date=expanded_dates[0] if expanded_dates else None,
                end_date=(expanded_dates[-1] + pd.Timedelta(days=1)) if expanded_dates else None,
            )

        with _timed_step("build_risk_section", holdings=len(latest_items)):
            risk = _build_risk_section(latest_items, set(nav_dict.keys()), nav_dict)

        with _timed_step("build_nav_audit"):
            nav_audit = _build_nav_audit()

        with _timed_step("build_mf_traces"):
            mf_traces = _build_mf_traces(
                holding_facts,
                monthly_periods,
                periods,
                prices,
                nav_dict,
                expanded_dates,
            )

        with _timed_step("save_cache", entries=len(cache)):
            save_cache(cache)

    return {
        "input": {
            "normalizedDates": [_serialize_timestamp(date) for date in input_state["dates"]],
            "activeTickers": sorted(ticker for ticker, flags in input_state["ticker_flags"].items() if not flags["isCash"]),
            "latestHoldingsDate": latest_holdings_date,
        },
        "timeline": {
            "expandedDates": [_serialize_timestamp(date) for date in expanded_dates],
            "periods": [{"start": _serialize_timestamp(start), "end": _serialize_timestamp(end)} for start, end in periods],
            "monthlyPeriods": [{"start": _serialize_timestamp(start), "end": _serialize_timestamp(end)} for start, end in monthly_periods],
        },
        "holdings": {
            "periodItems": period_items,
            "items": holdings_items,
            "latestItems": latest_items,
        },
        "attribution": {
            "items": holdings_items,
            "periodItems": period_items,
            "periodSheet": _serialize_period_sheet(period_df, periods),
            "monthlySheet": _serialize_monthly_sheet(monthly_df, monthly_periods),
            "periods": [{"start": _serialize_timestamp(start), "end": _serialize_timestamp(end)} for start, end in periods],
            "monthlyPeriods": [{"start": _serialize_timestamp(start), "end": _serialize_timestamp(end)} for start, end in monthly_periods],
            "benchmarkReturns": benchmark_returns,
            "benchmarkMonthlyReturns": benchmark_monthly_returns,
            "topContributors": _build_top_contributor_layouts(holding_facts, periods),
            "overviewLayouts": overview_layouts,
            "portfolioPeriodReturns": portfolio_period_returns,
            "portfolioMonthlyReturns": portfolio_monthly_returns,
            "portfolioYtdReturn": portfolio_ytd_return,
        },
        "performance": performance,
        "risk": risk,
        "audit": {
            "navAudit": nav_audit,
            "mutualFundTraces": mf_traces,
            "coverage": {
                "missingBoundaryPrices": [
                    {
                        "ticker": str(row["Ticker"]),
                        "start": _serialize_timestamp(row["StartDate"]),
                        "end": _serialize_timestamp(row["EndDate"]),
                    }
                    for _, row in holding_facts.loc[~holding_facts["PriceCovered"]].iterrows()
                    if row["Ticker"] != CASH_TICKER
                ],
            },
        },
    }
