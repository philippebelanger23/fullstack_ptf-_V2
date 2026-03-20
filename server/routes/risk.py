"""Risk and performance routes: /portfolio-backcast, /risk-contribution"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter

from market_data import needs_fx_adjustment
from models import BackcastRequest
from services.backcast_service import (
    aggregate_weights,
    build_benchmark_returns,
    build_portfolio_returns,
    compute_backcast_metrics,
    fetch_returns_df,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/portfolio-backcast")
async def portfolio_backcast(request: BackcastRequest):
    """
    Backcast the portfolio: given current weights, calculate daily returns over the past year.
    Compare to a benchmark (75% ACWI / 25% XIU.TO blend).
    Returns:
      - Daily cumulative performance series for Portfolio & Benchmark
      - Risk metrics: Sharpe, Volatility, Beta, Max Drawdown, Alpha, Total Return
    """
    items = request.items
    if not items:
        return {"error": "No portfolio items provided"}

    # 1. Aggregate weights
    weights_by_ticker, mutual_fund_tickers = aggregate_weights(items)

    if not weights_by_ticker:
        return {"error": "No valid tickers found"}

    # 2. Fetch price data
    try:
        returns_df, missing_tickers = fetch_returns_df(list(weights_by_ticker.keys()))
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Error downloading prices: {e}")
        return {"error": str(e)}

    # 3. Build portfolio and benchmark daily returns
    portfolio_returns, extra_missing = build_portfolio_returns(
        returns_df, weights_by_ticker, mutual_fund_tickers
    )
    missing_tickers = list(set(missing_tickers + extra_missing))

    benchmark_returns = build_benchmark_returns(returns_df)

    # 4. Compute metrics and series
    result = compute_backcast_metrics(portfolio_returns, benchmark_returns)
    result["missingTickers"] = missing_tickers

    return result


@router.post("/risk-contribution")
async def risk_contribution(request: BackcastRequest):
    """
    Per-position risk decomposition: marginal contribution to risk (MCTR),
    component risk, diversification ratio, and sector-level risk.
    Uses 1 year of daily returns and the portfolio covariance matrix.
    """
    items = request.items
    if not items:
        return {"error": "No portfolio items provided"}

    # 1. Aggregate weights
    weights_by_ticker, mutual_fund_tickers = aggregate_weights(items)

    if not weights_by_ticker:
        return {"error": "No valid tickers found"}

    # 2. Fetch price data
    try:
        returns_df, _ = fetch_returns_df(list(weights_by_ticker.keys()))
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Risk contribution - error downloading prices: {e}")
        return {"error": str(e)}

    # 3. Build per-ticker FX-adjusted daily returns matrix
    ticker_list = []
    weight_vec = []
    missing_tickers = []
    ticker_returns_cols = {}

    for ticker, weight in weights_by_ticker.items():
        if ticker not in returns_df.columns:
            missing_tickers.append(ticker)
            continue
        is_mf = ticker in mutual_fund_tickers
        if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in returns_df.columns:
            fx_ret = returns_df["USDCAD=X"]
            adj_ret = (1 + returns_df[ticker]) * (1 + fx_ret) - 1
        else:
            adj_ret = returns_df[ticker]
        ticker_list.append(ticker)
        weight_vec.append(weight)
        ticker_returns_cols[ticker] = adj_ret

    if len(ticker_list) < 1:
        return {"error": "No valid tickers with price data"}

    # Build returns matrix (days × tickers)
    returns_matrix = pd.DataFrame(ticker_returns_cols).iloc[1:]  # drop first NaN row
    w = np.array(weight_vec)

    # 4. Covariance matrix (annualized)
    cov_matrix = returns_matrix.cov().values * 252

    # Portfolio variance & volatility
    port_var = w @ cov_matrix @ w
    port_vol = np.sqrt(port_var) if port_var > 0 else 0.0

    # 5. Per-position risk metrics
    # MCTR = (Cov × w) / σ_portfolio
    cov_w = cov_matrix @ w
    mctr = cov_w / port_vol if port_vol > 0 else np.zeros(len(w))

    # Component risk = w_i × MCTR_i
    component_risk = w * mctr

    # % of total risk
    total_component = np.sum(component_risk)
    pct_of_total = component_risk / total_component if total_component > 0 else np.zeros(len(w))

    # Individual volatilities & annualized returns
    individual_vols = returns_matrix.std().values * np.sqrt(252)
    annualized_returns = returns_matrix.mean().values * 252

    # Beta to portfolio
    port_daily_ret = (returns_matrix.values * w).sum(axis=1)
    port_daily_var = np.var(port_daily_ret)
    betas = []
    for i in range(len(ticker_list)):
        if port_daily_var > 0:
            b = np.cov(returns_matrix.iloc[:, i].values, port_daily_ret)[0, 1] / port_daily_var
        else:
            b = 1.0
        betas.append(round(b, 3))

    # 6. Portfolio-level metrics
    sum_weighted_vol = np.sum(w * individual_vols)
    diversification_ratio = sum_weighted_vol / port_vol if port_vol > 0 else 1.0

    # HHI of risk contributions (concentration)
    hhi = np.sum(pct_of_total ** 2)
    num_effective_bets = 1.0 / hhi if hhi > 0 else len(ticker_list)

    # Top-3 concentration
    sorted_pct = np.sort(pct_of_total)[::-1]
    top3_concentration = float(np.sum(sorted_pct[:3])) if len(sorted_pct) >= 3 else float(np.sum(sorted_pct))

    # Benchmark volatility for comparison
    bmk_vol = 0.0
    if (
        "ACWI" in returns_df.columns
        and "XIU.TO" in returns_df.columns
        and "USDCAD=X" in returns_df.columns
    ):
        acwi_cad = (1 + returns_df["ACWI"]) * (1 + returns_df["USDCAD=X"]) - 1
        bmk_ret = 0.75 * acwi_cad + 0.25 * returns_df["XIU.TO"]
        bmk_vol = float(bmk_ret.iloc[1:].std() * np.sqrt(252))

    # 7. Build positions list
    positions = []
    for i, ticker in enumerate(ticker_list):
        risk_adj_ret = annualized_returns[i] / individual_vols[i] if individual_vols[i] > 0 else 0.0
        positions.append(
            {
                "ticker": ticker,
                "weight": round(float(w[i]) * 100, 2),
                "individualVol": round(float(individual_vols[i]) * 100, 2),
                "beta": betas[i],
                "mctr": round(float(mctr[i]) * 100, 4),
                "componentRisk": round(float(component_risk[i]) * 100, 4),
                "pctOfTotalRisk": round(float(pct_of_total[i]) * 100, 2),
                "annualizedReturn": round(float(annualized_returns[i]) * 100, 2),
                "riskAdjustedReturn": round(float(risk_adj_ret), 2),
            }
        )

    # 8. Sector-level risk aggregation
    sector_risk = []
    try:
        sectors_file = Path("data/custom_sectors.json")
        sector_map = {}
        if sectors_file.exists():
            with open(sectors_file) as f:
                sector_map = json.load(f)

        sector_weights: dict[str, float] = {}
        sector_risk_pct: dict[str, float] = {}
        for i, ticker in enumerate(ticker_list):
            sec = sector_map.get(ticker, "Other")
            sector_weights[sec] = sector_weights.get(sec, 0) + float(w[i])
            sector_risk_pct[sec] = sector_risk_pct.get(sec, 0) + float(pct_of_total[i])

        for sec in sorted(sector_weights.keys()):
            sector_risk.append(
                {
                    "sector": sec,
                    "weight": round(sector_weights[sec] * 100, 2),
                    "riskContribution": round(sector_risk_pct[sec] * 100, 2),
                }
            )
    except Exception as e:
        logger.warning(f"Could not load sector data for risk: {e}")

    return {
        "portfolioVol": round(float(port_vol) * 100, 2),
        "benchmarkVol": round(float(bmk_vol) * 100, 2),
        "diversificationRatio": round(float(diversification_ratio), 2),
        "concentrationRatio": round(float(hhi), 4),
        "numEffectiveBets": round(float(num_effective_bets), 1),
        "top3Concentration": round(float(top3_concentration) * 100, 1),
        "positions": positions,
        "sectorRisk": sector_risk,
        "missingTickers": missing_tickers,
    }
