"""
Shared performance and risk calculation primitives used by the canonical workspace.

Provides helpers for:
- Aggregating portfolio weights from PortfolioItem lists
- Fetching price data and building FX-adjusted returns DataFrames
- Computing all risk / performance metrics for the canonical performance response

KPI primitives (compute_beta, compute_annualized_vol, compute_sharpe, compute_sortino)
are the canonical single source of truth — all endpoints must call these instead of
reimplementing the formulas inline.
"""

import json
import logging
from datetime import datetime
from typing import List
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
import yfinance as yf

from market_data import extract_download_price_frame, needs_fx_adjustment, load_local_close_frame
from constants import BENCHMARK_BLEND_TICKERS
from data_loader import load_historic_nav_csvs, load_manual_navs_json, merge_nav_sources
from services.attribution_math import apply_fx_adjustment, geometric_chain
from services.yfinance_setup import configure_yfinance_cache

logger = logging.getLogger(__name__)

configure_yfinance_cache()


def _normalize_close_download(downloaded: pd.DataFrame | pd.Series, tickers: list[str]) -> pd.DataFrame:
    return extract_download_price_frame(downloaded, tickers)


# =============================================================================
# KPI Primitives — canonical implementations, used by every endpoint
# =============================================================================

def compute_beta(ptf_rets: np.ndarray, bmk_rets: np.ndarray) -> float:
    """Portfolio beta to benchmark.

    cov(ptf, bmk) / var(bmk), ddof=1 throughout for sample statistics.
    Returns 1.0 when benchmark variance is zero (degenerate case).
    """
    bmk_var = np.var(bmk_rets, ddof=1)
    if bmk_var > 0:
        return float(np.cov(ptf_rets, bmk_rets)[0, 1] / bmk_var)
    return 1.0


def compute_annualized_vol(daily_rets: np.ndarray) -> float:
    """Annualized volatility from daily returns (decimal, not %).

    Uses sample std (ddof=1) × sqrt(252).
    """
    return float(np.std(daily_rets, ddof=1) * np.sqrt(252))


def compute_sharpe(daily_rets: np.ndarray) -> float:
    """Annualized Sharpe ratio from daily returns (assumes risk-free rate = 0).

    Returns 0.0 when std is at or below floating-point noise threshold.
    """
    std = np.std(daily_rets, ddof=1)
    if std > 1e-12:
        return float((np.mean(daily_rets) / std) * np.sqrt(252))
    return 0.0


def compute_sortino(daily_rets: np.ndarray) -> float:
    """Annualized Sortino ratio from daily returns (assumes MAR = 0).

    Downside deviation = sqrt(mean(min(r, 0)^2)).
    Returns 0.0 when downside deviation is zero.
    """
    downside_dev = float(np.sqrt(np.mean(np.minimum(daily_rets, 0) ** 2)))
    if downside_dev > 0:
        return float((np.mean(daily_rets) / downside_dev) * np.sqrt(252))
    return 0.0


# =============================================================================
# Data helpers
# =============================================================================

CASH_TICKER_NAMES: set[str] = {"CASH", "*CASH*"}


def load_performance_nav_data() -> dict[str, dict[pd.Timestamp, float]]:
    """Load NAV data for canonical performance and risk calculations."""
    manual_navs = load_manual_navs_json("data/manual_navs.json")
    csv_navs = {}
    try:
        csv_navs = load_historic_nav_csvs("data/historic_navs")
    except Exception as e:
        logger.warning(f"Could not load historic NAVs for canonical performance: {e}")

    return merge_nav_sources(manual_navs, csv_navs)


def is_cash_ticker(ticker: str) -> bool:
    return ticker.upper().strip() in CASH_TICKER_NAMES


def aggregate_weights(items, nav_tickers: set[str] | None = None) -> tuple[dict, set]:
    """
    Collapse a list of PortfolioItem objects into
    (weights_by_ticker, mutual_fund_tickers).

    Weights are normalised to decimals (0-1 range).
    Placeholder rows ("TICKER") are skipped.
    Cash tickers (CASH, *CASH*) are KEPT with their weight so they correctly
    model cash drag: the cash allocation earns 0% return and is not renormalized
    away, keeping portfolio returns consistent with the Attribution view.
    Duplicate tickers keep the maximum weight.
    """
    weights_by_ticker: dict[str, float] = {}
    mutual_fund_tickers: set[str] = set()
    nav_tickers = nav_tickers or set()

    for item in items:
        ticker = item.ticker.upper().strip()
        if not ticker or "TICKER" in ticker:
            continue
        # Frontend sends weights as percentages (e.g. 10.0 = 10%, 0.5 = 0.5%).
        # Always divide by 100 to convert to decimal.
        # If weights are already decimal, normalisation (sum→1) preserves proportions.
        w = item.weight / 100.0
        if ticker in weights_by_ticker:
            weights_by_ticker[ticker] = max(weights_by_ticker[ticker], w)
        else:
            weights_by_ticker[ticker] = w
        if getattr(item, "isMutualFund", False):
            mutual_fund_tickers.add(ticker)
        if ticker in nav_tickers:
            mutual_fund_tickers.add(ticker)

    # Normalise to sum to 1 (cash tickers are included so their weight dilutes
    # equity exposure rather than being inflated away).
    total_weight = sum(weights_by_ticker.values())
    if total_weight > 0:
        weights_by_ticker = {k: v / total_weight for k, v in weights_by_ticker.items()}

    return weights_by_ticker, mutual_fund_tickers


def aggregate_period_weights(
    items,
    nav_tickers: set[str] | None = None,
) -> list[tuple[str, dict[str, float], set[str]]]:
    """
    Group portfolio items by date and compute normalized weights per period.

    Returns a **sorted** list of (date_str, weights_by_ticker, mutual_fund_tickers)
    tuples — one entry per rebalance date found in *items*.

    Used by the canonical workspace performance builder so the daily return
    series reflects actual rebalancing decisions instead of static max-weights.
    """
    from collections import defaultdict

    periods: dict[str, list] = defaultdict(list)
    nav_tickers = nav_tickers or set()
    for item in items:
        d = getattr(item, "date", None)
        if not d:
            continue
        periods[str(d)].append(item)

    result: list[tuple[str, dict[str, float], set[str]]] = []
    for date_str in sorted(periods.keys()):
        period_items = periods[date_str]
        weights_by_ticker: dict[str, float] = {}
        mutual_fund_tickers: set[str] = set()

        for item in period_items:
            ticker = item.ticker.upper().strip()
            if not ticker or "TICKER" in ticker:
                continue
            w = item.weight / 100.0
            weights_by_ticker[ticker] = w
            if getattr(item, "isMutualFund", False):
                mutual_fund_tickers.add(ticker)
            if ticker in nav_tickers:
                mutual_fund_tickers.add(ticker)

        total_weight = sum(weights_by_ticker.values())
        if total_weight > 0:
            weights_by_ticker = {k: v / total_weight for k, v in weights_by_ticker.items()}

        if weights_by_ticker:
            result.append((date_str, weights_by_ticker, mutual_fund_tickers))

    return result


def build_period_weighted_portfolio_returns(
    returns_df: pd.DataFrame,
    period_weights: list[tuple[str, dict[str, float], set[str]]],
) -> tuple[pd.Series, list[str]]:
    """
    Compute daily portfolio returns using period-specific weights.

    PortfolioItem.date is the period END date (set by run_portfolio_analysis).
    The weights in each entry apply from the *previous* period's end date (exclusive)
    up to and including this period's end date.

    For the first period: covers all dates up to its end date (including the pre-period lookback).
    For the last period: covers all dates after the previous period's end date.
    """
    portfolio_returns = pd.Series(0.0, index=returns_df.index)
    all_missing: set[str] = set()

    n = len(period_weights)
    for i, (date_str, weights, mf_tickers) in enumerate(period_weights):
        period_end = pd.Timestamp(date_str)

        if n == 1:
            # Only one period — covers all available data
            mask = pd.Series(True, index=returns_df.index)
        elif i == 0:
            # First period: all dates up to and including this period's end
            mask = returns_df.index <= period_end
        elif i == n - 1:
            # Last period: all dates strictly after the previous period's end
            prev_end = pd.Timestamp(period_weights[i - 1][0])
            mask = returns_df.index > prev_end
        else:
            # Middle periods: between previous end (exclusive) and this end (inclusive)
            prev_end = pd.Timestamp(period_weights[i - 1][0])
            mask = (returns_df.index > prev_end) & (returns_df.index <= period_end)

        slice_df = returns_df.loc[mask]
        if slice_df.empty:
            continue

        slice_return = pd.Series(0.0, index=slice_df.index)
        for ticker, weight in weights.items():
            if is_cash_ticker(ticker):
                continue  # 0% return — weight dilutes other positions
            if ticker in returns_df.columns:
                is_mf = ticker in mf_tickers
                needs_fx = needs_fx_adjustment(ticker, is_mutual_fund=is_mf)
                if needs_fx and "USDCAD=X" in returns_df.columns:
                    ticker_ret = apply_fx_adjustment(slice_df[ticker], slice_df["USDCAD=X"], True)
                else:
                    ticker_ret = slice_df[ticker]
                slice_return = slice_return + weight * ticker_ret
            else:
                all_missing.add(ticker)

        portfolio_returns.loc[mask] = slice_return

    return portfolio_returns, list(all_missing)


def compute_period_attribution(
    returns_df: pd.DataFrame,
    period_weights: list[tuple[str, dict[str, float], set[str]]],
    nav_tickers: set[str] | None = None,
) -> list[dict]:
    """
    Compute per-period, per-ticker attribution from the same daily returns
    used by build_period_weighted_portfolio_returns.

    Returns a list of dicts shaped like PortfolioItem (ticker, date, weight,
    returnPct, contribution) — one entry per (ticker, period).

    Formats match /analyze-manual output:
      weight       — %-form  (e.g. 10.0 for 10 %)
      returnPct    — decimal  (e.g. 0.05  for 5 %)
      contribution — %-form  (= weight * returnPct, e.g. 0.5)

    Using the daily-chain approach guarantees that the sum of period
    portfolio returns compounds to exactly the same total as the canonical performance series
    cumulative series.
    """
    n = len(period_weights)
    if n == 0:
        return []

    results: list[dict] = []
    nav_tickers = nav_tickers or set()

    for i, (date_str, weights, mf_tickers) in enumerate(period_weights):
        period_end = pd.Timestamp(date_str)

        # Same date-range mask as build_period_weighted_portfolio_returns
        if n == 1:
            mask = pd.Series(True, index=returns_df.index)
        elif i == 0:
            mask = returns_df.index <= period_end
        elif i == n - 1:
            prev_end = pd.Timestamp(period_weights[i - 1][0])
            mask = returns_df.index > prev_end
        else:
            prev_end = pd.Timestamp(period_weights[i - 1][0])
            mask = (returns_df.index > prev_end) & (returns_df.index <= period_end)

        slice_df = returns_df.loc[mask]

        for ticker, weight_decimal in weights.items():
            weight_pct = weight_decimal * 100.0  # convert to %-form for PortfolioItem

            if is_cash_ticker(ticker):
                results.append({
                    "ticker": ticker,
                    "date": date_str,
                    "weight": round(weight_pct, 6),
                    "returnPct": 0.0,
                    "contribution": 0.0,
                    "isCash": True,
                })
                continue

            if ticker not in returns_df.columns or slice_df.empty:
                # Ticker missing from price data — skip (will remain as-is from analyze-manual)
                continue

            is_mf = ticker in (set(mf_tickers) | nav_tickers)
            needs_fx = needs_fx_adjustment(ticker, is_mutual_fund=is_mf)
            if needs_fx and "USDCAD=X" in returns_df.columns:
                daily_ret = apply_fx_adjustment(slice_df[ticker], slice_df["USDCAD=X"], True)
            else:
                daily_ret = slice_df[ticker]

            # Geometric chain of daily returns = period return
            period_return = float(geometric_chain(daily_ret))
            contribution_pct = weight_pct * period_return  # %-form * decimal = %-form

            results.append({
                "ticker": ticker,
                "date": date_str,
                "weight": round(weight_pct, 6),
                "returnPct": period_return,
                "contribution": contribution_pct,
            })

    return results


def fetch_returns_df(
    portfolio_tickers: List[str],
    period: str = "1y",
    mutual_fund_tickers: set = None,
    nav_dict: dict | None = None,
    start_date: pd.Timestamp | str | None = None,
    end_date: pd.Timestamp | str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, list]:
    """
    Download price data for *portfolio_tickers* plus benchmark tickers.
    Returns (returns_df, raw_returns_df, missing_tickers).
    - returns_df: ffill/bfill + fillna(0) — for portfolio returns and covariance
    - raw_returns_df: pct_change with NaN preserved — for pairwise correlation
    Mutual fund tickers are excluded from the yfinance fetch (their data comes from CSV).
    """
    nav_dict = nav_dict or load_performance_nav_data()
    nav_tickers = set(nav_dict.keys())
    mf = (mutual_fund_tickers or set()) | nav_tickers
    yf_tickers = [t for t in portfolio_tickers if t not in mf]
    fetch_list = list(set(yf_tickers + BENCHMARK_BLEND_TICKERS))
    normalized_start = pd.Timestamp(start_date).normalize() if start_date is not None else None
    normalized_end = pd.Timestamp(end_date).normalize() if end_date is not None else None
    local_closes = load_local_close_frame(fetch_list)
    if not local_closes.empty:
        if normalized_start is not None:
            local_closes = local_closes.loc[local_closes.index >= normalized_start]
        if normalized_end is not None:
            local_closes = local_closes.loc[local_closes.index < normalized_end]
    missing_fetch_list = [ticker for ticker in fetch_list if ticker not in local_closes.columns]
    logger.info(
        "performance.fetch_returns_df start: portfolio_tickers=%s, yfinance_tickers=%s, local_tickers=%s, nav_tickers=%s, period=%s, start=%s, end=%s",
        len(portfolio_tickers),
        len(missing_fetch_list),
        len(local_closes.columns),
        len(nav_tickers),
        period,
        normalized_start.strftime("%Y-%m-%d") if normalized_start is not None else None,
        normalized_end.strftime("%Y-%m-%d") if normalized_end is not None else None,
    )
    downloaded_closes = pd.DataFrame()
    if missing_fetch_list:
        started_at = perf_counter()
        try:
            download_kwargs = {
                "interval": "1d",
                "progress": False,
                "timeout": 5,
                "threads": False,
                "auto_adjust": True,
            }
            if normalized_start is not None or normalized_end is not None:
                download_kwargs["start"] = normalized_start
                download_kwargs["end"] = normalized_end if normalized_end is not None else pd.Timestamp.today().normalize() + pd.Timedelta(days=1)
            else:
                download_kwargs["period"] = period
            data = yf.download(missing_fetch_list, **download_kwargs)
            downloaded_closes = _normalize_close_download(data, missing_fetch_list)
        except Exception as exc:
            logger.warning("performance.fetch_returns_df download failed: %s", exc)
            downloaded_closes = pd.DataFrame()
        logger.info(
            "performance.fetch_returns_df download end: duration=%.3fs, rows=%s",
            perf_counter() - started_at,
            len(downloaded_closes.index),
        )

    closes_parts = [frame for frame in [local_closes, downloaded_closes] if not frame.empty]
    if closes_parts:
        closes = pd.concat(closes_parts, axis=1)
        closes = closes.loc[:, ~closes.columns.duplicated(keep="first")].sort_index()
    else:
        closes = pd.DataFrame()

    if closes.empty and not nav_tickers:
        raise ValueError("Failed to fetch price data")

    if closes.empty:
        nav_dates = sorted({pd.to_datetime(dt).normalize() for ticker_navs in nav_dict.values() for dt in ticker_navs.keys()})
        closes = pd.DataFrame(index=pd.DatetimeIndex(nav_dates))
    else:
        closes.index = pd.to_datetime(closes.index).normalize()
    for ticker in portfolio_tickers:
        if ticker in nav_tickers:
            nav_series = pd.Series(nav_dict[ticker]).sort_index()
            nav_series.index = pd.to_datetime(nav_series.index).normalize()
            nav_series = nav_series.reindex(closes.index).ffill().bfill()
            closes[ticker] = nav_series

    raw_returns_df = closes.pct_change()
    filled_closes = closes.ffill().bfill()
    returns_df = filled_closes.pct_change().fillna(0)
    missing = [t for t in portfolio_tickers if t not in returns_df.columns]
    return returns_df, raw_returns_df, missing


def build_portfolio_returns(
    returns_df: pd.DataFrame,
    weights_by_ticker: dict,
    mutual_fund_tickers: set,
    nav_tickers: set[str] | None = None,
) -> tuple[pd.Series, list]:
    """
    Compute a daily portfolio-return Series applying FX adjustments where needed.
    Also returns the list of tickers that were missing from returns_df.
    """
    portfolio_returns = pd.Series(0.0, index=returns_df.index)
    missing_tickers = []
    effective_mf = set(mutual_fund_tickers or set()) | (nav_tickers or set())

    for ticker, weight in weights_by_ticker.items():
        if ticker in returns_df.columns:
            is_mf = ticker in effective_mf
            if needs_fx_adjustment(ticker, is_mutual_fund=is_mf) and "USDCAD=X" in returns_df.columns:
                fx_ret = returns_df["USDCAD=X"]
                ticker_ret = (1 + returns_df[ticker]) * (1 + fx_ret) - 1
            else:
                ticker_ret = returns_df[ticker]
            portfolio_returns += weight * ticker_ret
        else:
            missing_tickers.append(ticker)

    return portfolio_returns, missing_tickers


def build_benchmark_returns(
    returns_df: pd.DataFrame,
    benchmark: str = "75/25",
) -> pd.Series:
    """Build benchmark daily returns.

    benchmark:
      "75/25" → 75% ACWI (USD→CAD) + 25% XIC.TO  (default composite)
      "TSX" → 100% XIC.TO  (S&P/TSX Composite, CAD proxy)
      "SP500" → 100% XUS.TO  (S&P 500 CAD-hedged ETF, no FX needed)
    """
    benchmark_returns = pd.Series(0.0, index=returns_df.index)

    if benchmark == "TSX":
        if "XIC.TO" in returns_df.columns:
            benchmark_returns = returns_df["XIC.TO"]
    elif benchmark == "SP500":
        if "XUS.TO" in returns_df.columns:
            benchmark_returns = returns_df["XUS.TO"]
    elif benchmark == "ACWI":
        if "ACWI" in returns_df.columns and "USDCAD=X" in returns_df.columns:
            benchmark_returns = (1 + returns_df["ACWI"]) * (1 + returns_df["USDCAD=X"]) - 1
    else:  # default "75/25"
        if (
            "ACWI" in returns_df.columns
            and "XIC.TO" in returns_df.columns
            and "USDCAD=X" in returns_df.columns
        ):
            acwi_cad_ret = (1 + returns_df["ACWI"]) * (1 + returns_df["USDCAD=X"]) - 1
            benchmark_returns = 0.75 * acwi_cad_ret + 0.25 * returns_df["XIC.TO"]

    return benchmark_returns


# =============================================================================
# Composite metric functions
# =============================================================================

def compute_performance_metrics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
) -> dict:
    """
    Given aligned portfolio and benchmark daily return Series, compute all
    risk / performance metrics returned by the canonical workspace.
    """
    portfolio_cumulative = (1 + portfolio_returns).cumprod() * 100
    benchmark_cumulative = (1 + benchmark_returns).cumprod() * 100

    ptf_rets = portfolio_returns.iloc[1:].values
    bmk_rets = benchmark_returns.iloc[1:].values

    sharpe_ratio    = compute_sharpe(ptf_rets)
    sortino_ratio   = compute_sortino(ptf_rets)
    volatility      = compute_annualized_vol(ptf_rets)
    beta            = compute_beta(ptf_rets, bmk_rets)

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
    benchmark_volatility = compute_annualized_vol(bmk_rets)
    benchmark_sharpe     = compute_sharpe(bmk_rets)
    benchmark_sortino    = compute_sortino(bmk_rets)

    # Information Ratio
    excess_rets = ptf_rets - bmk_rets
    tracking_error = compute_annualized_vol(excess_rets)
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

    top_drawdowns = _detect_drawdown_episodes(drawdown, dates)

    return {"metrics": metrics, "series": performance_series, "topDrawdowns": top_drawdowns}


def compute_rolling_metrics(
    portfolio_returns: pd.Series,
    benchmark_returns: pd.Series,
    windows: list = None,
) -> dict:
    """
    Compute rolling Sharpe, volatility, and beta for portfolio and benchmark.
    Windows: 21 = 1M, 63 = 3M, 126 = 6M (trading days).
    Returns {"windows": {21: [...], 63: [...], 126: [...]}}.
    """
    if windows is None:
        windows = [21, 63, 126]

    dates = portfolio_returns.index
    result = {}

    for window in windows:
        records = []
        for i in range(window, len(portfolio_returns)):
            ptf_slice = portfolio_returns.iloc[i - window:i].values
            bmk_slice = benchmark_returns.iloc[i - window:i].values
            date_str = dates[i].strftime("%Y-%m-%d")

            ptf_sharpe = compute_sharpe(ptf_slice)
            bmk_sharpe = compute_sharpe(bmk_slice)
            ptf_vol    = compute_annualized_vol(ptf_slice) * 100
            bmk_vol    = compute_annualized_vol(bmk_slice) * 100
            beta       = compute_beta(ptf_slice, bmk_slice)

            records.append({
                "date": date_str,
                "portfolio": {
                    "sharpe": round(float(ptf_sharpe), 3),
                    "vol": round(float(ptf_vol), 2),
                    "beta": round(float(beta), 3),
                },
                "benchmark": {
                    "sharpe": round(float(bmk_sharpe), 3),
                    "vol": round(float(bmk_vol), 2),
                    "beta": 1.0,
                },
            })

        result[window] = records

    return {"windows": result}


def _detect_drawdown_episodes(drawdown: pd.Series, dates: list, top_n: int = 5) -> list:
    """
    Detect the top N drawdown episodes from a drawdown Series (values ≤ 0).
    Each episode: {start, trough, recovery, depth (negative %), durationDays, recoveryDays}.
    """
    eps = 0.0001
    episodes = []
    n = len(drawdown)
    in_drawdown = False
    peak_idx = 0
    trough_idx = 0
    trough_val = 0.0

    date_objs = [datetime.strptime(d, "%Y-%m-%d").date() for d in dates]

    for i in range(n):
        dd = float(drawdown.iloc[i])
        if not in_drawdown:
            if dd < -eps:
                in_drawdown = True
                trough_idx = i
                trough_val = dd
            else:
                peak_idx = i
        else:
            if dd < trough_val:
                trough_idx = i
                trough_val = dd
            if dd >= -eps:
                episodes.append({
                    "start": dates[peak_idx],
                    "trough": dates[trough_idx],
                    "recovery": dates[i],
                    "depth": round(trough_val * 100, 2),
                    "durationDays": (date_objs[trough_idx] - date_objs[peak_idx]).days,
                    "recoveryDays": (date_objs[i] - date_objs[trough_idx]).days,
                })
                in_drawdown = False
                peak_idx = i

    # Ongoing drawdown (not yet recovered)
    if in_drawdown:
        episodes.append({
            "start": dates[peak_idx],
            "trough": dates[trough_idx],
            "recovery": None,
            "depth": round(trough_val * 100, 2),
            "durationDays": (date_objs[trough_idx] - date_objs[peak_idx]).days,
            "recoveryDays": None,
        })

    # Sort by depth (worst first), take top N
    episodes.sort(key=lambda x: x["depth"])
    return episodes[:top_n]
