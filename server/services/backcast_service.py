"""
Backcast calculation logic shared between /portfolio-backcast and /risk-contribution.

Provides helpers for:
- Aggregating portfolio weights from PortfolioItem lists
- Fetching price data and building FX-adjusted returns DataFrames
- Computing all risk / performance metrics for the backcast response
"""

import logging
from typing import List

import numpy as np
import pandas as pd
import yfinance as yf

from market_data import needs_fx_adjustment
from constants import BENCHMARK_BLEND_TICKERS

logger = logging.getLogger(__name__)


def aggregate_weights(items) -> tuple[dict, set]:
    """
    Collapse a list of PortfolioItem objects into
    (weights_by_ticker, mutual_fund_tickers).

    Weights are normalised to decimals (0-1 range).
    Cash / placeholder rows are skipped.
    Duplicate tickers keep the maximum weight.
    """
    weights_by_ticker: dict[str, float] = {}
    mutual_fund_tickers: set[str] = set()

    for item in items:
        ticker = item.ticker.upper().strip()
        if not ticker or "TICKER" in ticker or "CASH" in ticker.upper():
            continue
        w = item.weight / 100.0 if item.weight > 1 else item.weight
        if ticker in weights_by_ticker:
            weights_by_ticker[ticker] = max(weights_by_ticker[ticker], w)
        else:
            weights_by_ticker[ticker] = w
        if getattr(item, "isMutualFund", False):
            mutual_fund_tickers.add(ticker)

    # Normalise to sum to 1
    total_weight = sum(weights_by_ticker.values())
    if total_weight > 0:
        weights_by_ticker = {k: v / total_weight for k, v in weights_by_ticker.items()}

    return weights_by_ticker, mutual_fund_tickers


def fetch_returns_df(
    portfolio_tickers: List[str],
    period: str = "1y",
) -> tuple[pd.DataFrame, list]:
    """
    Download price data for *portfolio_tickers* plus benchmark tickers.
    Returns (returns_df, missing_tickers).
    """
    fetch_list = list(set(portfolio_tickers + BENCHMARK_BLEND_TICKERS))
    data = yf.download(fetch_list, period=period, interval="1d", progress=False)
    if data.empty:
        raise ValueError("Failed to fetch price data")
    closes = data["Close"] if "Close" in data.columns else data
    closes = closes.ffill().bfill()
    returns_df = closes.pct_change().fillna(0)
    missing = [t for t in portfolio_tickers if t not in returns_df.columns]
    return returns_df, missing


def build_portfolio_returns(
    returns_df: pd.DataFrame,
    weights_by_ticker: dict,
    mutual_fund_tickers: set,
) -> tuple[pd.Series, list]:
    """
    Compute a daily portfolio-return Series applying FX adjustments where needed.
    Also returns the list of tickers that were missing from returns_df.
    """
    portfolio_returns = pd.Series(0.0, index=returns_df.index)
    missing_tickers = []

    for ticker, weight in weights_by_ticker.items():
        if ticker in returns_df.columns:
            is_mf = ticker in mutual_fund_tickers
            if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in returns_df.columns:
                fx_ret = returns_df["USDCAD=X"]
                ticker_ret = (1 + returns_df[ticker]) * (1 + fx_ret) - 1
            else:
                ticker_ret = returns_df[ticker]
            portfolio_returns += weight * ticker_ret
        else:
            missing_tickers.append(ticker)

    return portfolio_returns, missing_tickers


def build_benchmark_returns(returns_df: pd.DataFrame) -> pd.Series:
    """Build benchmark daily returns: 75 % ACWI (CAD) + 25 % XIU.TO."""
    benchmark_returns = pd.Series(0.0, index=returns_df.index)
    if (
        "ACWI" in returns_df.columns
        and "XIU.TO" in returns_df.columns
        and "USDCAD=X" in returns_df.columns
    ):
        acwi_cad_ret = (1 + returns_df["ACWI"]) * (1 + returns_df["USDCAD=X"]) - 1
        benchmark_returns = 0.75 * acwi_cad_ret + 0.25 * returns_df["XIU.TO"]
    return benchmark_returns


def compute_backcast_metrics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
) -> dict:
    """
    Given aligned portfolio and benchmark daily return Series, compute all
    risk / performance metrics returned by the /portfolio-backcast endpoint.
    """
    portfolio_cumulative = (1 + portfolio_returns).cumprod() * 100
    benchmark_cumulative = (1 + benchmark_returns).cumprod() * 100

    ptf_rets = portfolio_returns.iloc[1:].values
    bmk_rets = benchmark_returns.iloc[1:].values

    # Sharpe
    mean_daily_ret = np.mean(ptf_rets)
    std_daily_ret = np.std(ptf_rets)
    sharpe_ratio = (mean_daily_ret / std_daily_ret) * np.sqrt(252) if std_daily_ret > 0 else 0.0

    # Sortino
    negative_rets = ptf_rets[ptf_rets < 0]
    downside_std = np.std(negative_rets) if len(negative_rets) > 0 else std_daily_ret
    sortino_ratio = (mean_daily_ret / downside_std) * np.sqrt(252) if downside_std > 0 else 0.0

    # Volatility (annualized)
    volatility = std_daily_ret * np.sqrt(252)

    # Beta
    if np.var(bmk_rets) > 0:
        beta = np.cov(ptf_rets, bmk_rets)[0, 1] / np.var(bmk_rets)
    else:
        beta = 1.0

    # Max Drawdown – Portfolio
    cumulative_series = (1 + portfolio_returns).cumprod()
    running_max = cumulative_series.cummax()
    drawdown = (cumulative_series - running_max) / running_max
    max_drawdown = drawdown.min()

    # Max Drawdown – Benchmark
    bmk_cumulative_series = (1 + benchmark_returns).cumprod()
    bmk_running_max = bmk_cumulative_series.cummax()
    bmk_drawdown = (bmk_cumulative_series - bmk_running_max) / bmk_running_max
    benchmark_max_drawdown = bmk_drawdown.min()

    # Total Return
    total_return = (portfolio_cumulative.iloc[-1] / 100) - 1
    benchmark_total_return = (benchmark_cumulative.iloc[-1] / 100) - 1

    # Alpha
    years_elapsed = len(ptf_rets) / 252
    if years_elapsed > 0:
        ptf_annualized = (1 + total_return) ** (1 / years_elapsed) - 1
        bmk_annualized = (1 + benchmark_total_return) ** (1 / years_elapsed) - 1
        alpha = ptf_annualized - bmk_annualized
    else:
        alpha = 0.0

    # Benchmark metrics
    bmk_std = np.std(bmk_rets)
    benchmark_volatility = bmk_std * np.sqrt(252)
    benchmark_sharpe = (np.mean(bmk_rets) / bmk_std) * np.sqrt(252) if bmk_std > 0 else 0.0

    bmk_negative_rets = bmk_rets[bmk_rets < 0]
    bmk_downside_std = np.std(bmk_negative_rets) if len(bmk_negative_rets) > 0 else bmk_std
    benchmark_sortino = (np.mean(bmk_rets) / bmk_downside_std) * np.sqrt(252) if bmk_downside_std > 0 else 0.0

    # Information Ratio
    excess_rets = ptf_rets - bmk_rets
    tracking_error = np.std(excess_rets) * np.sqrt(252)
    mean_excess_ret = np.mean(excess_rets) * 252
    information_ratio = mean_excess_ret / tracking_error if tracking_error > 0 else 0.0

    # Performance series for chart
    dates = portfolio_cumulative.index.strftime("%Y-%m-%d").tolist()
    portfolio_values = portfolio_cumulative.tolist()
    benchmark_values = benchmark_cumulative.tolist()

    performance_series = []
    for i, date_str in enumerate(dates):
        if pd.notna(portfolio_values[i]) and pd.notna(benchmark_values[i]):
            performance_series.append(
                {
                    "date": date_str,
                    "portfolio": portfolio_values[i],
                    "benchmark": benchmark_values[i],
                }
            )

    metrics = {
        "totalReturn": round(total_return * 100, 2),
        "benchmarkReturn": round(benchmark_total_return * 100, 2),
        "alpha": round(alpha * 100, 2),
        "sharpeRatio": round(sharpe_ratio, 2),
        "sortinoRatio": round(sortino_ratio, 2),
        "informationRatio": round(information_ratio, 2),
        "trackingError": round(tracking_error * 100, 2),
        "volatility": round(volatility * 100, 2),
        "beta": round(beta, 2),
        "maxDrawdown": round(max_drawdown * 100, 2),
        "benchmarkMaxDrawdown": round(benchmark_max_drawdown * 100, 2),
        "benchmarkVolatility": round(benchmark_volatility * 100, 2),
        "benchmarkSharpe": round(benchmark_sharpe, 2),
        "benchmarkSortino": round(benchmark_sortino, 2),
    }

    return {"metrics": metrics, "series": performance_series}
