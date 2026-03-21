"""Portfolio analysis routes: /analyze-manual"""

import json
import logging
from pathlib import Path
from typing import List

import pandas as pd
from fastapi import APIRouter, HTTPException

from data_loader import load_historic_nav_csvs
from market_data import calculate_returns, build_results_dataframe
from cache_manager import load_cache, save_cache
from models import PortfolioItem, ManualAnalysisRequest

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared NAV helper
# ---------------------------------------------------------------------------

def get_aggregated_nav_data() -> dict:
    """
    Load and aggregate NAV data from all server-side sources:
    1. manual_navs.json
    2. historic_navs/*.csv
    """
    nav_dict = {}

    # 1. Load manually provided NAVs
    manual_nav_path = Path("data/manual_navs.json")
    if manual_nav_path.exists():
        try:
            with open(manual_nav_path, "r") as f:
                static_navs = json.load(f)
                for ticker, dates_data in static_navs.items():
                    if ticker not in nav_dict:
                        nav_dict[ticker] = {}
                    for d, v in dates_data.items():
                        nav_dict[ticker][pd.to_datetime(d)] = v
        except Exception as e:
            logger.warning(f"Failed to load manual_navs.json: {e}")

    # 2. Load historical CSV NAVs
    try:
        csv_navs = load_historic_nav_csvs("data/historic_navs")
        for ticker, dates_data in csv_navs.items():
            if ticker not in nav_dict:
                nav_dict[ticker] = {}
            nav_dict[ticker].update(dates_data)
    except Exception as e:
        logger.warning(f"Failed to load historical CSV NAVs: {e}")

    return nav_dict


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
) -> List[PortfolioItem]:
    """Core logic shared between file upload and manual entry."""
    cache = load_cache()
    if mutual_fund_tickers is None:
        mutual_fund_tickers = set()
    if etf_tickers is None:
        etf_tickers = set()
    if cash_tickers is None:
        cash_tickers = set()

    logger.info("Fetching market data...")
    returns, prices = calculate_returns(weights_dict, nav_dict, dates, cache, mutual_fund_tickers)

    save_cache(cache)

    # Load custom sector weights if available
    custom_sectors = {}
    sector_path = Path("data/custom_sectors.json")
    if sector_path.exists():
        try:
            with open(sector_path, "r") as f:
                custom_sectors = json.load(f)
        except Exception:
            pass

    logger.info("Building results dataframe...")
    df, periods = build_results_dataframe(
        weights_dict, returns, prices, dates, cache, mutual_fund_tickers, custom_sectors
    )

    result_items = []

    if df.empty:
        return []

    # Iterate through each period to create time-series data for the client
    for i, period in enumerate(periods):
        end_date_ts = period[1]
        date_str = end_date_ts.strftime("%Y-%m-%d")

        for _, row in df.iterrows():
            ticker = row["Ticker"]
            t_upper = ticker.upper().strip()

            weight = row.get(f"Weight_{i}", 0.0)
            ret = row.get(f"Return_{i}", 0.0)
            contrib = row.get(f"Contrib_{i}", 0.0)

            ticker_custom_sectors = custom_sectors.get(ticker)

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
            )
            result_items.append(item)

    return result_items


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze-manual", response_model=List[PortfolioItem])
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

        # Automatically add 'Today' if the last date is in the past
        latest_date = dates[-1]
        now = pd.Timestamp.now().normalize()
        if latest_date < now:
            # Inject intermediate month-end dates between the last config date and today
            month_end_dates = pd.date_range(
                start=latest_date + pd.DateOffset(days=1),
                end=now,
                freq="ME",
            )
            for me_date in month_end_dates:
                me_ts = pd.Timestamp(me_date).normalize()
                if me_ts not in dates_set:
                    dates.append(me_ts)
                    dates_set.add(me_ts)
                    for ticker in weights_dict:
                        prior_dates = sorted([d for d in weights_dict[ticker] if d <= me_ts])
                        if prior_dates:
                            weights_dict[ticker][me_ts] = weights_dict[ticker][prior_dates[-1]]

            dates.append(now)
            for ticker in weights_dict:
                prior_dates = sorted([d for d in weights_dict[ticker] if d < now])
                if prior_dates:
                    weights_dict[ticker][now] = weights_dict[ticker][prior_dates[-1]]

            dates = sorted(dates)

        nav_dict = get_aggregated_nav_data()

        mutual_fund_tickers = {item.ticker.upper().strip() for item in request.items if item.isMutualFund}
        etf_tickers = {item.ticker.upper().strip() for item in request.items if item.isEtf}
        cash_tickers = {item.ticker.upper().strip() for item in request.items if item.isCash}

        return run_portfolio_analysis(weights_dict, nav_dict, dates, mutual_fund_tickers, etf_tickers, cash_tickers)

    except Exception as e:
        logger.error(f"Error in manual analysis: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
