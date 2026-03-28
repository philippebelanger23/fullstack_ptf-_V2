"""Risk and performance routes: /portfolio-backcast, /risk-contribution"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import APIRouter

from market_data import needs_fx_adjustment
from models import BackcastRequest
from services.backcast_service import (
    aggregate_period_weights,
    aggregate_weights,
    build_benchmark_returns,
    build_period_weighted_portfolio_returns,
    build_portfolio_returns,
    compute_backcast_metrics,
    compute_beta,
    compute_annualized_vol,
    compute_rolling_metrics,
    fetch_returns_df,
    is_cash_ticker,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/portfolio-backcast")
async def portfolio_backcast(request: BackcastRequest):
    """
    Backcast the portfolio using **period-aware weights**: each rebalance date's
    weights apply until the next rebalance, so the return reflects actual
    allocation decisions — consistent with the Attribution view.

    Compare to a benchmark (75% ACWI / 25% XIC.TO blend by default).
    Returns:
      - Daily cumulative performance series for Portfolio & Benchmark
      - Risk metrics: Sharpe, Volatility, Beta, Max Drawdown, Alpha, Total Return
    """
    items = request.items
    if not items:
        return {"error": "No portfolio items provided"}

    # 1. Aggregate period-specific weights (one set per rebalance date)
    period_weights = aggregate_period_weights(items)
    if not period_weights:
        return {"error": "No valid tickers found"}

    # 2. Fetch price data — all unique tradeable tickers across every period
    all_tickers = list({t for _, w, _ in period_weights for t in w if not is_cash_ticker(t)})
    try:
        returns_df, _, missing_tickers = fetch_returns_df(all_tickers)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Error downloading prices: {e}")
        return {"error": str(e)}

    # 3. Build portfolio and benchmark daily returns
    portfolio_returns, extra_missing = build_period_weighted_portfolio_returns(
        returns_df, period_weights
    )
    # Cash tickers are intentionally absent from price data — don't surface as missing
    missing_tickers = [t for t in set(missing_tickers + extra_missing) if not is_cash_ticker(t)]

    benchmark_returns = build_benchmark_returns(returns_df, benchmark=request.benchmark)

    # 4. Compute metrics and series
    result = compute_backcast_metrics(portfolio_returns, benchmark_returns)
    result["missingTickers"] = missing_tickers
    result["fetchedAt"] = datetime.now(timezone.utc).isoformat()

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

    # 2. Fetch price data — exclude cash tickers (they earn 0% and have no price series)
    tradeable_tickers = [t for t in weights_by_ticker if not is_cash_ticker(t)]
    try:
        returns_df, raw_returns_df, _ = fetch_returns_df(tradeable_tickers)
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

    # Beta to portfolio (ddof=1 consistent with cov)
    port_daily_ret = (returns_matrix.values * w).sum(axis=1)
    port_daily_var = np.var(port_daily_ret, ddof=1)
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

    # Benchmark volatility & portfolio beta to benchmark
    # Use the canonical primitives from backcast_service to guarantee values
    # match /portfolio-backcast and /rolling-metrics exactly.
    bmk_vol = 0.0
    portfolio_beta = 1.0
    shared_ptf_returns, _ = build_portfolio_returns(returns_df, weights_by_ticker, mutual_fund_tickers)
    shared_bmk_returns = build_benchmark_returns(returns_df, benchmark=request.benchmark)
    ptf_daily = shared_ptf_returns.iloc[1:].values
    bmk_daily = shared_bmk_returns.iloc[1:].values
    if len(bmk_daily) > 0:
        bmk_vol = compute_annualized_vol(bmk_daily)
        portfolio_beta = compute_beta(ptf_daily, bmk_daily)

    # Historical VaR 95% & CVaR 95% (1-day)
    var_threshold = np.percentile(port_daily_ret, 5)
    var_95 = float(abs(var_threshold))
    tail_returns = port_daily_ret[port_daily_ret <= var_threshold]
    cvar_95 = float(abs(np.mean(tail_returns))) if len(tail_returns) > 0 else var_95

    # 7. Load sector map (used for positions + sector aggregation)
    sector_map: dict[str, str] = {}
    try:
        sectors_file = Path("data/sectors_cache.json")
        if sectors_file.exists():
            with open(sectors_file) as f:
                cached = json.load(f)
            sector_map.update({k: v for k, v in cached.items() if isinstance(v, str)})

        # Fetch any missing tickers from yfinance and persist to cache
        missing_sectors = [t for t in ticker_list if t not in sector_map]
        if missing_sectors:
            tickers_obj = yf.Tickers(" ".join(missing_sectors))
            for tk in missing_sectors:
                try:
                    info = tickers_obj.tickers[tk].info
                    sector = info.get("sector")
                    if not sector:
                        qt = info.get("quoteType", "").upper()
                        sector = "Mixed" if qt in ("ETF", "MUTUALFUND") else None
                    if sector:
                        sector_map[tk] = sector
                except Exception:
                    pass
            # Persist updated cache
            try:
                sectors_file.parent.mkdir(parents=True, exist_ok=True)
                merged = {}
                if sectors_file.exists():
                    with open(sectors_file) as f:
                        merged = json.load(f)
                merged.update(sector_map)
                with open(sectors_file, "w") as f:
                    json.dump(merged, f)
            except Exception as e:
                logger.warning(f"Could not save sector cache: {e}")
    except Exception as e:
        logger.warning(f"Could not load sector data: {e}")

    # 8. Build positions list
    positions = []
    for i, ticker in enumerate(ticker_list):
        risk_adj_ret = annualized_returns[i] / individual_vols[i] if individual_vols[i] > 0 else 0.0
        positions.append(
            {
                "ticker": ticker,
                "sector": sector_map.get(ticker, "Other"),
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

    # 9. Sector-level risk aggregation
    sector_risk = []
    try:

        sec_wt_agg: dict[str, float] = {}
        sec_risk_agg: dict[str, float] = {}
        for i, ticker in enumerate(ticker_list):
            sec = sector_map.get(ticker, "Other")
            sec_wt_agg[sec] = sec_wt_agg.get(sec, 0) + float(w[i])
            sec_risk_agg[sec] = sec_risk_agg.get(sec, 0) + float(pct_of_total[i])

        for sec in sorted(sec_wt_agg.keys()):
            sector_risk.append(
                {
                    "sector": sec,
                    "weight": round(sec_wt_agg[sec] * 100, 2),
                    "riskContribution": round(sec_risk_agg[sec] * 100, 2),
                }
            )
    except Exception as e:
        logger.warning(f"Could not aggregate sector risk: {e}")

    # 10. Compute correlation matrix (top 15 positions by risk contribution)
    # EWMA (Exponentially Weighted Moving Average) correlation — RiskMetrics standard.
    # Halflife of 63 trading days (~3 months): recent data weighted more, old regimes decay out.
    # More robust than sample Pearson: adapts to correlation regime changes over the 1Y window.
    EWMA_HALFLIFE = 63   # ~3-month halflife for daily data
    EWMA_MIN_OBS = 21    # require at least 1 month of data before trusting a series
    correlation_matrix = None
    try:
        sorted_positions = sorted(positions, key=lambda x: -x["pctOfTotalRisk"])[:15]
        corr_tickers = [p["ticker"] for p in sorted_positions]

        # Build FX-adjusted raw return series (NaN preserved for genuinely missing price days)
        raw_corr_cols = {}
        for ticker in corr_tickers:
            if ticker not in raw_returns_df.columns:
                continue
            is_mf = ticker in mutual_fund_tickers
            if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in raw_returns_df.columns:
                fx_ret = raw_returns_df["USDCAD=X"]
                raw_corr_cols[ticker] = (1 + raw_returns_df[ticker]) * (1 + fx_ret) - 1
            else:
                raw_corr_cols[ticker] = raw_returns_df[ticker]

        corr_returns = pd.DataFrame(raw_corr_cols).iloc[1:]  # drop first NaN row

        # EWMA covariance matrix — last row of the rolling estimate = current estimate
        ewma_cov_panel = corr_returns.ewm(halflife=EWMA_HALFLIFE, min_periods=EWMA_MIN_OBS).cov()
        last_ts = ewma_cov_panel.index.get_level_values(0)[-1]
        cov_now = ewma_cov_panel.loc[last_ts].values.astype(float)   # (n × n)
        final_tickers = list(ewma_cov_panel.loc[last_ts].index)

        # Normalise covariance → correlation
        std_now = np.sqrt(np.maximum(np.diag(cov_now), 0.0))
        outer_std = np.outer(std_now, std_now)
        with np.errstate(divide='ignore', invalid='ignore'):
            corr_array = np.where(outer_std > 0, cov_now / outer_std, 0.0)

        np.fill_diagonal(corr_array, 1.0)
        corr_array = np.clip(corr_array, -1.0, 1.0)
        # Any NaN left (ticker had < EWMA_MIN_OBS observations) → 0 off-diagonal
        corr_array = np.nan_to_num(corr_array, nan=0.0)
        np.fill_diagonal(corr_array, 1.0)

        correlation_matrix = {
            "tickers": final_tickers,
            "matrix": np.round(corr_array, 3).tolist(),
        }
    except Exception as e:
        logger.warning(f"Could not compute correlation matrix: {e}")

    return {
        "portfolioVol": round(float(port_vol) * 100, 2),
        "benchmarkVol": round(float(bmk_vol) * 100, 2),
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
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/rolling-metrics")
async def rolling_metrics_endpoint(request: BackcastRequest):
    """
    Compute rolling Sharpe, volatility, and beta for portfolio and benchmark.
    Windows: 21 (1M), 63 (3M), 126 (6M) trading days.
    Uses period-aware weights for consistency with /portfolio-backcast.
    """
    items = request.items
    if not items:
        return {"error": "No portfolio items provided"}

    period_weights = aggregate_period_weights(items)
    if not period_weights:
        return {"error": "No valid tickers found"}

    all_tickers = list({t for _, w, _ in period_weights for t in w if not is_cash_ticker(t)})
    try:
        returns_df, _, _ = fetch_returns_df(all_tickers)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Rolling metrics - error downloading prices: {e}")
        return {"error": str(e)}

    portfolio_returns, _ = build_period_weighted_portfolio_returns(returns_df, period_weights)
    benchmark_returns = build_benchmark_returns(returns_df, benchmark=request.benchmark)

    return compute_rolling_metrics(portfolio_returns, benchmark_returns)
