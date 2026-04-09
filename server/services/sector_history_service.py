"""Shared sector benchmark history loader."""

from __future__ import annotations

import datetime
import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf

from market_data import extract_history_price_series, load_local_close_frame
from services.path_utils import resolve_storage_path
from services.yfinance_parallel import parallel_fetch
from services.yfinance_setup import configure_yfinance_cache

logger = logging.getLogger(__name__)

configure_yfinance_cache()

SECTOR_HISTORY_CACHE_TTL = datetime.timedelta(hours=1)

US_SECTOR_MAP = {
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

CA_SECTOR_MAP = {
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

OVERALL_MAP = {
    "SP500": "SPY",
    "TSX": "XIC.TO",
}

_REQUIRED_MAPS = {
    "US": US_SECTOR_MAP,
    "CA": CA_SECTOR_MAP,
    "OVERALL": OVERALL_MAP,
}


def _cache_path() -> Path:
    return resolve_storage_path("data/sector_history_cache.json")


def _has_required_series(payload: dict[str, Any]) -> bool:
    for region, sector_map in _REQUIRED_MAPS.items():
        region_payload = payload.get(region)
        if not isinstance(region_payload, dict):
            return False
        for sector in sector_map:
            series = region_payload.get(sector)
            if not isinstance(series, list) or len(series) < 2:
                return False
    return True


def _load_cached_sector_history(cache_file: Path) -> dict[str, Any] | None:
    if not cache_file.exists():
        return None

    try:
        with open(cache_file, "r", encoding="utf-8") as handle:
            cached = json.load(handle)
        if isinstance(cached, dict) and _has_required_series(cached):
            return cached
    except Exception as exc:
        logger.warning("Failed to read sector history cache: %s", exc)

    return None


def _cache_is_stale(cache_file: Path) -> bool:
    if not cache_file.exists():
        return True

    try:
        mtime = datetime.datetime.fromtimestamp(cache_file.stat().st_mtime)
    except Exception:
        return True

    return datetime.datetime.now() - mtime >= SECTOR_HISTORY_CACHE_TTL


def _build_region_data(closes: pd.DataFrame, sector_map: dict[str, str]) -> dict[str, list[dict[str, Any]]]:
    region_data: dict[str, list[dict[str, Any]]] = {}

    for sector, ticker in sector_map.items():
        series_data: pd.Series | None = None

        if ticker in closes.columns:
            col = closes[ticker]
            if col.notna().sum() > 10:
                series_data = col

        if series_data is None:
            try:
                logger.info("Falling back to single-ticker download for %s (%s)", ticker, sector)
                single = yf.download(ticker, period="5y", interval="1d", progress=False, auto_adjust=True)
                if not single.empty:
                    single_closes = extract_download_price_frame(single, [ticker])
                    if ticker in single_closes.columns:
                        candidate = single_closes[ticker].ffill().bfill()
                        if candidate.notna().sum() > 10:
                            series_data = candidate
            except Exception as exc:
                logger.warning("Single-ticker fallback failed for %s: %s", ticker, exc)

        if series_data is None:
            continue

        ticker_dates = series_data.index.strftime("%Y-%m-%d").tolist()
        points = [
            {"date": date_str, "value": value}
            for date_str, value in zip(ticker_dates, series_data.tolist())
            if pd.notna(value)
        ]
        if points:
            region_data[sector] = points

    return region_data


def _download_series(ticker: str) -> pd.Series:
    hist = yf.Ticker(ticker).history(period="5y", interval="1d", auto_adjust=True)
    if hist.empty:
        return pd.Series(dtype=float)

    series = extract_history_price_series(hist).dropna()
    if series.empty:
        return pd.Series(dtype=float)

    series.index = pd.to_datetime(series.index).normalize()
    series.name = ticker
    return series


def _fetch_sector_history() -> dict[str, Any]:
    all_tickers = list(set(list(US_SECTOR_MAP.values()) + list(CA_SECTOR_MAP.values()) + list(OVERALL_MAP.values())))
    logger.info("Fetching fresh sector history for %d tickers (US + CA)...", len(all_tickers))

    local_closes = load_local_close_frame(all_tickers)
    if not local_closes.empty:
        local_closes = local_closes.ffill().bfill()

    missing_tickers = [
        ticker for ticker in all_tickers
        if ticker not in local_closes.columns or local_closes[ticker].notna().sum() <= 10
    ]
    downloaded, failures = parallel_fetch(missing_tickers, _download_series, max_workers=8)
    if failures:
        logger.info("sector history fallback fetches failed for %d tickers", len(failures))

    downloaded_frames = [
        series.rename(ticker)
        for ticker, series in downloaded.items()
        if isinstance(series, pd.Series) and not series.empty
    ]
    if downloaded_frames:
        downloaded_closes = pd.concat(downloaded_frames, axis=1)
        closes_parts = [frame for frame in [local_closes, downloaded_closes] if not frame.empty]
    else:
        closes_parts = [frame for frame in [local_closes] if not frame.empty]

    if not closes_parts:
        return {"US": {}, "CA": {}, "OVERALL": {}}

    closes = pd.concat(closes_parts, axis=1).sort_index()
    closes = closes.loc[:, ~closes.columns.duplicated(keep="first")].ffill().bfill()
    return {
        "US": _build_region_data(closes, US_SECTOR_MAP),
        "CA": _build_region_data(closes, CA_SECTOR_MAP),
        "OVERALL": _build_region_data(closes, OVERALL_MAP),
    }


def load_sector_history_cache(force_refresh: bool = False) -> dict[str, Any]:
    cache_file = _cache_path()
    cached = None if force_refresh else _load_cached_sector_history(cache_file)
    if cached is not None and not _cache_is_stale(cache_file):
        return cached

    try:
        fresh = _fetch_sector_history()
        if _has_required_series(fresh):
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as handle:
                json.dump(fresh, handle)
            return fresh

        logger.warning("Fetched sector history is incomplete; falling back to cached data if available")
    except Exception as exc:
        logger.error("Error fetching sector history: %s", exc)

    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as handle:
                cached = json.load(handle)
            if isinstance(cached, dict):
                return cached
        except Exception as exc:
            logger.warning("Failed to re-read sector history cache: %s", exc)

    return {"US": {}, "CA": {}, "OVERALL": {}}
