"""Configuration routes: save/load portfolio config, sector weights, asset geography,
NAV lag check, and NAV file upload."""

import datetime
import json
import logging
import shutil
from pathlib import Path

import pandas as pd

import yfinance as yf
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from cache_manager import load_cache, save_cache
from market_data import get_price_on_date, get_fx_return, needs_fx_adjustment
from models import PortfolioConfig
from routes.portfolio import get_aggregated_nav_data
from services.config_manager import load_json, save_json

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/save-portfolio-config")
async def save_portfolio_config(config: PortfolioConfig):
    try:
        config_path = Path("data/portfolio_config.json")
        save_json(config_path, config.dict(), description="portfolio config")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving portfolio config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load-portfolio-config")
async def load_portfolio_config():
    try:
        config_path = Path("data/portfolio_config.json")
        data = load_json(config_path, default={"tickers": [], "periods": []}, description="portfolio config")
        return data
    except Exception as e:
        logger.error(f"Error loading portfolio config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save-sector-weights")
async def save_sector_weights(request: dict):
    """Save custom sector weight breakdowns (e.g. for ETFs/MFs)"""
    try:
        weights = request.get("weights", {})
        path = Path("data/custom_sectors.json")
        save_json(path, weights, description="sector weights")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving sector weights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load-sector-weights")
async def load_sector_weights():
    try:
        path = Path("data/custom_sectors.json")
        return load_json(path, default={}, description="sector weights")
    except Exception as e:
        logger.error(f"Error loading sector weights: {e}")
        return {}


@router.post("/save-asset-geo")
async def save_asset_geo(request: dict):
    """Save custom geographical classifications (e.g. CA, US, INTL)"""
    try:
        geo = request.get("geo", {})
        path = Path("data/custom_geography.json")
        save_json(path, geo, description="asset geography")
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving asset geography: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load-asset-geo")
async def load_asset_geo():
    try:
        path = Path("data/custom_geography.json")
        return load_json(path, default={}, description="asset geography")
    except Exception as e:
        logger.error(f"Error loading asset geography: {e}")
        return {}


@router.post("/save-manual-nav")
async def save_manual_nav(request: dict):
    """Add or update a single NAV entry in manual_navs.json."""
    try:
        ticker = request.get("ticker", "").upper().strip()
        date_str = request.get("date", "").strip()
        nav_value = request.get("nav")

        if not ticker or not date_str or nav_value is None:
            raise HTTPException(status_code=400, detail="ticker, date, and nav are required")

        nav_value = float(nav_value)

        manual_path = Path("data/manual_navs.json")
        data = {}
        if manual_path.exists():
            with open(manual_path, "r") as f:
                data = json.load(f)

        if ticker not in data:
            data[ticker] = {}
        data[ticker][date_str] = nav_value

        # Sort dates within ticker
        data[ticker] = dict(sorted(data[ticker].items()))

        with open(manual_path, "w") as f:
            json.dump(data, f, indent=2)

        logger.info(f"Saved manual NAV: {ticker} {date_str} = {nav_value}")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving manual NAV: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-nav-lag")
async def check_nav_lag(request: dict):
    """
    Compare last NAV date on file with last yfinance date for a set of tickers.
    If NAV date is behind yfinance (usually > 1-2 days lag), flag it.

    Args:
        request.tickers: List of ticker symbols to check
        request.force_refresh: If true, ignore internal caches
    """
    tickers = request.get("tickers", [])
    force_refresh = request.get("force_refresh", False)
    reference_date_str = request.get("reference_date")

    if not tickers:
        return {}

    results = {}

    # 1. Load freshest NAV data (always from disk)
    nav_data = get_aggregated_nav_data()
    logger.info(
        f"check-nav-lag: Started check for {len(tickers)} tickers. "
        f"force_refresh={force_refresh}, ref_date={reference_date_str}"
    )

    def get_last_business_day(reference_date=None):
        if reference_date is None:
            reference_date = datetime.datetime.now().date()
        while reference_date.weekday() >= 5:
            reference_date -= datetime.timedelta(days=1)
        return reference_date

    # 2. Get global market threshold
    if reference_date_str:
        try:
            last_market_date = datetime.datetime.strptime(reference_date_str, "%Y-%m-%d").date()
            last_market_date = get_last_business_day(last_market_date)
            logger.info(f"check-nav-lag: Using provided reference date: {last_market_date}")
        except Exception as e:
            logger.warning(f"Invalid reference_date {reference_date_str}, falling back to today. Error: {e}")
            last_market_date = get_last_business_day()
    else:
        try:
            spy_hist = yf.download("SPY", period="5d", progress=False, threads=False)
            if not spy_hist.empty:
                last_market_date = spy_hist.index[-1].date()
                logger.info(f"check-nav-lag: Latest market date from SPY: {last_market_date}")
            else:
                raise ValueError("SPY history empty")
        except Exception as market_err:
            logger.warning(
                f"check-nav-lag: Failed to fetch market date ({market_err}). "
                "Falling back to business day logic."
            )
            last_market_date = get_last_business_day()

    last_bday = get_last_business_day(last_market_date)
    threshold_date = get_last_business_day(last_bday - datetime.timedelta(days=1))

    for ticker in tickers:
        try:
            ticker = ticker.upper().strip()

            ticker_navs = nav_data.get(ticker, {})
            if not ticker_navs:
                results[ticker] = {
                    "lagging": True,
                    "reason": "Missing Data",
                    "last_nav": None,
                    "last_market": last_market_date.strftime("%Y-%m-%d"),
                    "threshold_date": threshold_date.strftime("%Y-%m-%d"),
                    "days_diff": 999,
                }
                continue

            last_nav_dt = max(ticker_navs.keys())
            if hasattr(last_nav_dt, "date"):
                last_nav_date = last_nav_dt.date()
            else:
                last_nav_date = last_nav_dt

            is_lagging = last_nav_date < threshold_date
            days_diff = (last_market_date - last_nav_date).days

            results[ticker] = {
                "lagging": is_lagging,
                "last_nav": last_nav_date.strftime("%Y-%m-%d"),
                "last_market": last_market_date.strftime("%Y-%m-%d"),
                "days_diff": days_diff,
                "threshold_date": threshold_date.strftime("%Y-%m-%d"),
                "is_stale": is_lagging,
            }

            if is_lagging:
                logger.info(
                    f"check-nav-lag: {ticker} is LAGGING. "
                    f"Last NAV: {last_nav_date}, Market: {last_market_date}"
                )

        except Exception as e:
            logger.error(f"check-nav-lag: Error checking {ticker}: {e}")
            results[ticker] = {"lagging": False, "error": str(e)}

    return results


@router.get("/nav-audit")
async def nav_audit():
    """Return all NAV data with source attribution for auditing."""
    try:
        result = {}

        # 1. Load manual NAVs
        manual_path = Path("data/manual_navs.json")
        manual_navs = {}
        if manual_path.exists():
            with open(manual_path, "r") as f:
                manual_navs = json.load(f)

        # 2. Load CSV NAVs
        csv_navs = {}
        try:
            from data_loader import load_historic_nav_csvs
            csv_navs = load_historic_nav_csvs("data/historic_navs")
        except Exception as e:
            logger.warning(f"nav-audit: Failed to load CSV NAVs: {e}")

        # 3. Build unified result with source tags
        all_tickers = set(manual_navs.keys()) | set(csv_navs.keys())

        for ticker in sorted(all_tickers):
            entries = []
            seen_dates = set()

            # CSV entries take priority (more recent uploads)
            for dt, val in sorted(csv_navs.get(ticker, {}).items()):
                date_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)
                entries.append({"date": date_str, "nav": round(float(val), 4), "source": "csv"})
                seen_dates.add(date_str)

            # Manual entries (only if not already covered by CSV)
            for date_str, val in sorted(manual_navs.get(ticker, {}).items()):
                if date_str not in seen_dates:
                    entries.append({"date": date_str, "nav": round(float(val), 4), "source": "manual"})

            # Sort by date
            entries.sort(key=lambda e: e["date"])

            # Add period return for each entry
            for i, entry in enumerate(entries):
                if i == 0:
                    entry["returnPct"] = None
                else:
                    prev = entries[i - 1]["nav"]
                    if prev and prev != 0:
                        entry["returnPct"] = round((entry["nav"] - prev) / prev * 100, 4)
                    else:
                        entry["returnPct"] = None

            result[ticker] = entries

        return result
    except Exception as e:
        logger.error(f"nav-audit error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/price-audit")
async def price_audit(
    ticker: str = Query(..., description="Ticker symbol, e.g. AAPL or CNR.TO"),
    start_date: str = Query(..., description="Start date YYYY-MM-DD"),
    end_date: str = Query(..., description="End date YYYY-MM-DD"),
):
    """
    Fetch raw yfinance prices for a ticker over a date range and return the
    computed return alongside FX details. Used to validate that the app's
    price base matches known published data (total-return adjusted close).
    """
    try:
        cache = load_cache()
        nav_dict = get_aggregated_nav_data()

        start_ts = pd.to_datetime(start_date)
        end_ts = pd.to_datetime(end_date)

        price_start = get_price_on_date(ticker.upper(), start_ts, cache)
        price_end = get_price_on_date(ticker.upper(), end_ts, cache)

        if price_start is None or price_end is None:
            raise HTTPException(status_code=404, detail=f"Could not fetch prices for {ticker} on the given dates")

        period_return = (price_end / price_start) - 1

        needs_fx = needs_fx_adjustment(ticker.upper(), nav_dict=nav_dict)
        fx_start = fx_end = fx_return = cad_adjusted_return = None

        if needs_fx:
            from constants import FX_TICKER
            fx_start = get_price_on_date(FX_TICKER, start_ts, cache)
            fx_end = get_price_on_date(FX_TICKER, end_ts, cache)
            if fx_start and fx_end and fx_start != 0:
                fx_return = (fx_end / fx_start) - 1
                cad_adjusted_return = (1 + period_return) * (1 + fx_return) - 1

        # Fetch the full daily price series for the range
        try:
            hist = yf.download(ticker.upper(), start=start_ts,
                               end=end_ts + pd.Timedelta(days=1),
                               progress=False, auto_adjust=True)
            # Handle multi-level column index from yfinance
            if isinstance(hist.columns, pd.MultiIndex):
                close_col = hist['Close'][ticker.upper()]
            else:
                close_col = hist['Close']
            prices_series = [
                {"date": str(idx.date()), "close": round(float(val), 4)}
                for idx, val in close_col.items()
            ]
        except Exception:
            prices_series = []

        save_cache(cache)

        return {
            "ticker": ticker.upper(),
            "source": "yfinance auto_adjust=True (total-return adjusted close: split + dividend adjusted)",
            "start_date": start_date,
            "end_date": end_date,
            "price_start": round(float(price_start), 4),
            "price_end": round(float(price_end), 4),
            "period_return_pct": round(period_return * 100, 4),
            "needs_fx": needs_fx,
            "fx_start": round(float(fx_start), 4) if fx_start else None,
            "fx_end": round(float(fx_end), 4) if fx_end else None,
            "fx_return_pct": round(fx_return * 100, 4) if fx_return is not None else None,
            "cad_adjusted_return_pct": round(cad_adjusted_return * 100, 4) if cad_adjusted_return is not None else None,
            "prices": prices_series,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"price-audit error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-nav/{ticker}")
async def upload_nav(ticker: str, file: UploadFile = File(...)):
    """Upload a CSV NAV file for a specific mutual fund ticker."""
    try:
        ticker = ticker.upper()
        path = Path("data/historic_navs")
        path.mkdir(parents=True, exist_ok=True)

        file_path = path / f"{ticker}.csv"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info(f"Successfully uploaded NAV CSV for {ticker}")
        return {"success": True, "ticker": ticker}
    except Exception as e:
        logger.error(f"Error uploading NAV for {ticker}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
