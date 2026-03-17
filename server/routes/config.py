"""Configuration routes: save/load portfolio config, sector weights, asset geography,
NAV lag check, and NAV file upload."""

import datetime
import json
import logging
import shutil
from pathlib import Path

import yfinance as yf
from fastapi import APIRouter, File, HTTPException, UploadFile

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
