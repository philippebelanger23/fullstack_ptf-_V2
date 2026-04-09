"""Canonical benchmark workspace service."""

from __future__ import annotations

import datetime as dt
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf

from cache_manager import load_cache, save_cache
from market_data import extract_download_price_frame, get_ticker_performance
from services.path_utils import resolve_storage_path
from services.yfinance_setup import configure_yfinance_cache

configure_yfinance_cache()

logger = logging.getLogger(__name__)

BENCHMARK_SERIES_KEY = "75/25"
WORKSPACE_CACHE_TTL = dt.timedelta(hours=1)
EXPOSURE_STALENESS_THRESHOLD = dt.timedelta(days=7)
HISTORY_CACHE_TTL = dt.timedelta(hours=1)

COUNTRY_CURRENCY_MAP: dict[str, str] = {
    "United States": "USD",
    "Canada": "CAD",
    "Japan": "JPY",
    "United Kingdom": "GBP",
    "France": "EUR",
    "Germany": "EUR",
    "Netherlands": "EUR",
    "Switzerland": "CHF",
    "Australia": "AUD",
    "China": "CNY",
    "Taiwan": "TWD",
    "India": "INR",
}

CURRENCY_CODE_TO_TICKER: dict[str, str] = {
    "USD": "USDCAD=X",
    "JPY": "JPYCAD=X",
    "EUR": "EURCAD=X",
    "GBP": "GBPCAD=X",
    "CHF": "CHFCAD=X",
    "AUD": "AUDCAD=X",
    "CNY": "CNYCAD=X",
    "TWD": "TWDCAD=X",
    "INR": "INRCAD=X",
    "CAD": "CAD",
}

_refresh_lock = threading.Lock()
_refresh_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="benchmark-workspace")


def _workspace_cache_path() -> Path:
    return resolve_storage_path("data/benchmark_workspace_cache.json")


def _exposure_path() -> Path:
    return resolve_storage_path("data/index_exposure.json")


def _history_cache_path() -> Path:
    return resolve_storage_path("data/index_history_cache.json")


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        return loaded if isinstance(loaded, dict) else None
    except Exception as exc:
        logger.warning("Failed to read json %s: %s", path, exc)
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)


def _parse_timestamp(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = dt.datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except ValueError:
        return None


def _now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _today_iso_date() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def _cache_age(path: Path) -> dt.timedelta | None:
    if not path.exists():
        return None
    return dt.datetime.now() - dt.datetime.fromtimestamp(path.stat().st_mtime)


def _load_cached_workspace() -> dict[str, Any] | None:
    return _read_json(_workspace_cache_path())


def _save_workspace(payload: dict[str, Any]) -> None:
    _write_json(_workspace_cache_path(), payload)


def _workspace_is_stale(workspace: dict[str, Any] | None) -> bool:
    if not workspace:
        return True

    meta = workspace.get("meta", {})
    if bool(meta.get("stale")):
        return True

    built_at = _parse_timestamp(meta.get("builtAt"))
    if built_at is None:
        return True

    return (dt.datetime.now(dt.timezone.utc) - built_at) > WORKSPACE_CACHE_TTL


def _normalize_history_payload(raw_payload: dict[str, Any] | None) -> dict[str, list[dict[str, Any]]]:
    raw_payload = raw_payload or {}
    composite = raw_payload.get(BENCHMARK_SERIES_KEY)
    if not isinstance(composite, list):
        composite = raw_payload.get("Index", [])

    today_iso = _today_iso_date()

    def _sanitize_series(series: Any) -> list[dict[str, Any]]:
        if not isinstance(series, list):
            return []
        sanitized: list[dict[str, Any]] = []
        for point in series:
            if not isinstance(point, dict):
                continue
            date_str = point.get("date")
            value = point.get("value")
            if not isinstance(date_str, str) or date_str > today_iso:
                continue
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                continue
            sanitized.append({"date": date_str, "value": numeric_value})
        return sanitized

    normalized = {
        "ACWI": _sanitize_series(raw_payload.get("ACWI", [])),
        "XIC.TO": _sanitize_series(raw_payload.get("XIC.TO", [])),
        BENCHMARK_SERIES_KEY: _sanitize_series(composite),
    }
    return {
        key: value if isinstance(value, list) else []
        for key, value in normalized.items()
    }


def _history_as_of(series_map: dict[str, list[dict[str, Any]]]) -> str | None:
    dates: list[str] = []
    for series in series_map.values():
        if not series:
            continue
        last = series[-1]
        if isinstance(last, dict) and isinstance(last.get("date"), str):
            dates.append(last["date"])
    return max(dates) if dates else None


def _exposure_is_stale(data_path: Path) -> bool:
    raw = _read_json(data_path)
    if not raw:
        return True

    date_str = str(raw.get("scraped_at", ""))[:10] or raw.get("ACWI", {}).get("as_of_date", "")
    try:
        data_date = dt.datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return True
    return dt.datetime.now() - data_date > EXPOSURE_STALENESS_THRESHOLD


def _build_composition_payload(raw_data: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    acwi = raw_data.get("ACWI", {})
    tsx = raw_data.get("TSX", {})

    all_sectors = set(acwi.get("Sectors", {}).keys()) | set(tsx.get("Sectors", {}).keys())
    sectors: list[dict[str, Any]] = []
    for sector in all_sectors:
        w_acwi = float(acwi.get("Sectors", {}).get(sector, 0.0) or 0.0)
        w_tsx = float(tsx.get("Sectors", {}).get(sector, 0.0) or 0.0)
        benchmark_weight = (w_acwi * 0.75) + (w_tsx * 0.25)
        if benchmark_weight > 0.01:
            sectors.append(
                {
                    "sector": sector,
                    "ACWI": round(w_acwi, 2),
                    "TSX": round(w_tsx, 2),
                    "benchmarkWeight": round(benchmark_weight, 2),
                }
            )
    sectors.sort(key=lambda row: row["benchmarkWeight"], reverse=True)

    all_regions = set(acwi.get("Geography", {}).keys()) | set(tsx.get("Geography", {}).keys())
    geography: list[dict[str, Any]] = []
    for region in all_regions:
        w_acwi = float(acwi.get("Geography", {}).get(region, 0.0) or 0.0)
        w_tsx = float(tsx.get("Geography", {}).get(region, 0.0) or 0.0)
        benchmark_weight = (w_acwi * 0.75) + (w_tsx * 0.25)
        if benchmark_weight > 0.01:
            geography.append(
                {
                    "region": region,
                    "weight": round(benchmark_weight, 2),
                    "ACWI": round(w_acwi, 2),
                    "TSX": round(w_tsx, 2),
                }
            )
    geography.sort(key=lambda row: row["weight"], reverse=True)

    exposure_as_of = acwi.get("as_of_date") or str(raw_data.get("scraped_at", ""))[:10] or None
    return {"sectors": sectors, "geography": geography}, exposure_as_of


def _load_composition_slice(existing_workspace: dict[str, Any] | None, *, force_refresh: bool) -> tuple[dict[str, Any], str, str | None, str | None]:
    path = _exposure_path()
    existing_slice = (existing_workspace or {}).get("composition", {})
    existing_meta = (existing_workspace or {}).get("meta", {})
    refresh_error: str | None = None

    needs_refresh = force_refresh or _exposure_is_stale(path)
    if needs_refresh:
        try:
            from index_scraper import scrape_index_data

            scrape_index_data()
        except Exception as exc:
            refresh_error = str(exc)
            logger.error("benchmark composition refresh failed: %s", exc)

    raw = _read_json(path)
    if raw:
        composition, exposure_as_of = _build_composition_payload(raw)
        status = "fresh" if refresh_error is None and not _exposure_is_stale(path) else "stale"
        return composition, status, refresh_error, exposure_as_of

    if existing_slice:
        return existing_slice, "stale", refresh_error or "composition source unavailable", existing_meta.get("exposureAsOf")

    empty = {"sectors": [], "geography": []}
    return empty, "error", refresh_error or "composition source unavailable", None


def _fetch_fresh_history_payload() -> dict[str, Any]:
    tickers = ["ACWI", "XIC.TO", "USDCAD=X"]
    data = yf.download(tickers, period="5y", interval="1d", progress=False, auto_adjust=True)
    if data.empty:
        return {"ACWI": [], "XIC.TO": [], BENCHMARK_SERIES_KEY: []}

    closes = extract_download_price_frame(data, tickers)
    expected_cols = ["ACWI", "XIC.TO", "USDCAD=X"]
    existing_cols = [column for column in expected_cols if column in closes.columns]
    if not existing_cols:
        return {"ACWI": [], "XIC.TO": [], BENCHMARK_SERIES_KEY: []}

    closes = closes[existing_cols].ffill().bfill()
    dates = closes.index.strftime("%Y-%m-%d").tolist()

    if "ACWI" in closes.columns and "USDCAD=X" in closes.columns:
        acwi_cad_series = closes["ACWI"] * closes["USDCAD=X"]
    else:
        acwi_cad_series = pd.Series(dtype=float)

    xic_series = closes["XIC.TO"] if "XIC.TO" in closes.columns else pd.Series(dtype=float)

    if not acwi_cad_series.empty and not xic_series.empty:
        composite_ret = (acwi_cad_series.pct_change().fillna(0) * 0.75) + (xic_series.pct_change().fillna(0) * 0.25)
        composite_series = (1 + composite_ret).cumprod() * 100
    else:
        composite_series = pd.Series(dtype=float)

    payload = {"ACWI": [], "XIC.TO": [], BENCHMARK_SERIES_KEY: []}
    acwi_list = acwi_cad_series.tolist() if not acwi_cad_series.empty else []
    xic_list = xic_series.tolist() if not xic_series.empty else []
    composite_list = composite_series.tolist() if not composite_series.empty else []

    for index, date_str in enumerate(dates):
        if index < len(acwi_list) and pd.notna(acwi_list[index]):
            payload["ACWI"].append({"date": date_str, "value": float(acwi_list[index])})
        if index < len(xic_list) and pd.notna(xic_list[index]):
            payload["XIC.TO"].append({"date": date_str, "value": float(xic_list[index])})
        if index < len(composite_list) and pd.notna(composite_list[index]):
            payload[BENCHMARK_SERIES_KEY].append({"date": date_str, "value": float(composite_list[index])})

    return payload


def _load_history_slice(existing_workspace: dict[str, Any] | None, *, force_refresh: bool) -> tuple[dict[str, Any], str, str | None, str | None]:
    cache_path = _history_cache_path()
    existing_slice = ((existing_workspace or {}).get("performance") or {}).get("series", {})
    existing_meta = (existing_workspace or {}).get("meta", {})

    cache_payload = _normalize_history_payload(_read_json(cache_path))
    cache_is_fresh = False
    age = _cache_age(cache_path)
    if age is not None:
        cache_is_fresh = age < HISTORY_CACHE_TTL

    if not force_refresh and cache_payload[BENCHMARK_SERIES_KEY] and cache_is_fresh:
        return {"series": cache_payload}, "fresh", None, _history_as_of(cache_payload)

    refresh_error: str | None = None
    try:
        fresh_payload = _fetch_fresh_history_payload()
        _write_json(cache_path, fresh_payload)
        normalized = _normalize_history_payload(fresh_payload)
        return {"series": normalized}, "fresh", None, _history_as_of(normalized)
    except Exception as exc:
        refresh_error = str(exc)
        logger.error("benchmark history refresh failed: %s", exc)

    if cache_payload[BENCHMARK_SERIES_KEY]:
        return {"series": cache_payload}, "stale", refresh_error, _history_as_of(cache_payload)

    if existing_slice:
        normalized_existing = _normalize_history_payload(existing_slice)
        return {"series": normalized_existing}, "stale", refresh_error or "history source unavailable", existing_meta.get("historyAsOf")

    empty = {"series": {"ACWI": [], "XIC.TO": [], BENCHMARK_SERIES_KEY: []}}
    return empty, "error", refresh_error or "history source unavailable", None


def _build_currency_rows(geography: list[dict[str, Any]]) -> list[dict[str, Any]]:
    totals: dict[str, float] = {}
    for row in geography:
        region = str(row.get("region", ""))
        weight = float(row.get("weight", 0.0) or 0.0)
        code = COUNTRY_CURRENCY_MAP.get(region, "Other")
        totals[code] = totals.get(code, 0.0) + weight

    ranked = sorted(
        ({"code": code, "weight": weight} for code, weight in totals.items()),
        key=lambda row: row["weight"],
        reverse=True,
    )
    top_rows = [row for row in ranked if row["code"] != "Other"][:4]
    kept_codes = {row["code"] for row in top_rows}
    other_weight = sum(row["weight"] for row in ranked if row["code"] == "Other" or row["code"] not in kept_codes)
    if other_weight > 0.01:
        top_rows.append({"code": "Other", "weight": other_weight})

    total_weight = sum(row["weight"] for row in top_rows)
    if total_weight < 99.9:
        diff = 100 - total_weight
        for row in top_rows:
            if row["code"] == "Other":
                row["weight"] += diff
                break
        else:
            top_rows.append({"code": "Other", "weight": diff})

    return top_rows


def _load_currency_slice(existing_workspace: dict[str, Any] | None, geography: list[dict[str, Any]]) -> tuple[dict[str, Any], str, str | None]:
    existing_slice = (existing_workspace or {}).get("currency", {})
    rows = _build_currency_rows(geography)

    fx_tickers = sorted(
        {
            ticker
            for row in rows
            for ticker in [CURRENCY_CODE_TO_TICKER.get(str(row.get("code")))]
            if ticker and ticker not in {"CAD"}
        }
    )

    perf_by_ticker: dict[str, dict[str, float]] = {}
    refresh_error: str | None = None
    if fx_tickers:
        try:
            cache = load_cache()
            perf_by_ticker = get_ticker_performance(fx_tickers, cache)
            save_cache(cache)
        except Exception as exc:
            refresh_error = str(exc)
            logger.error("benchmark currency refresh failed: %s", exc)

    if refresh_error and existing_slice:
        return existing_slice, "stale", refresh_error

    payload_rows: list[dict[str, Any]] = []
    for row in rows:
        code = str(row.get("code"))
        ticker = CURRENCY_CODE_TO_TICKER.get(code)
        if code == "CAD":
            performance = {"YTD": 0.0, "3M": 0.0, "6M": 0.0, "1Y": 0.0}
        elif code == "Other" or not ticker:
            performance = None
        else:
            performance = perf_by_ticker.get(ticker)

        payload_rows.append(
            {
                "code": code,
                "weight": round(float(row.get("weight", 0.0) or 0.0), 2),
                "ticker": None if code == "Other" else ticker,
                "performance": performance,
            }
        )

    return {"rows": payload_rows}, "fresh" if refresh_error is None else "error", refresh_error


def build_benchmark_workspace(existing_workspace: dict[str, Any] | None = None, *, force_refresh: bool = False) -> dict[str, Any]:
    composition, composition_status, composition_error, exposure_as_of = _load_composition_slice(
        existing_workspace,
        force_refresh=force_refresh,
    )
    performance, performance_status, performance_error, history_as_of = _load_history_slice(
        existing_workspace,
        force_refresh=force_refresh,
    )
    currency, currency_status, currency_error = _load_currency_slice(
        existing_workspace,
        composition.get("geography", []),
    )

    errors = {
        key: value
        for key, value in {
            "composition": composition_error,
            "performance": performance_error,
            "currency": currency_error,
        }.items()
        if value
    }
    source_status = {
        "composition": {"status": composition_status, "error": composition_error},
        "performance": {"status": performance_status, "error": performance_error},
        "currency": {"status": currency_status, "error": currency_error},
    }

    return {
        "composition": composition,
        "performance": performance,
        "currency": currency,
        "meta": {
            "builtAt": _now_iso(),
            "exposureAsOf": exposure_as_of or ((existing_workspace or {}).get("meta", {}) or {}).get("exposureAsOf"),
            "historyAsOf": history_as_of or ((existing_workspace or {}).get("meta", {}) or {}).get("historyAsOf"),
            "stale": any(status["status"] != "fresh" for status in source_status.values()),
            "sourceStatus": source_status,
            "errors": errors,
        },
    }


def refresh_benchmark_workspace(*, force_refresh: bool = True) -> dict[str, Any]:
    with _refresh_lock:
        existing = _load_cached_workspace()
        workspace = build_benchmark_workspace(existing, force_refresh=force_refresh)
        _save_workspace(workspace)
        return workspace


def _background_refresh_worker() -> None:
    try:
        existing = _load_cached_workspace()
        workspace = build_benchmark_workspace(existing, force_refresh=False)
        _save_workspace(workspace)
    except Exception as exc:
        logger.error("background benchmark refresh failed: %s", exc)
    finally:
        _refresh_lock.release()


def trigger_background_benchmark_refresh() -> bool:
    if not _refresh_lock.acquire(blocking=False):
        return False
    _refresh_executor.submit(_background_refresh_worker)
    return True


def get_benchmark_workspace() -> dict[str, Any]:
    cached = _load_cached_workspace()
    if cached is None:
        return refresh_benchmark_workspace(force_refresh=False)

    if _workspace_is_stale(cached):
        trigger_background_benchmark_refresh()

    return cached
