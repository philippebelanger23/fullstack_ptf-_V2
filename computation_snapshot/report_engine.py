"""Chronological computation pipeline for portfolio reporting."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

import market_data
from constants import BENCHMARK_TICKERS, CASH_TICKER, FX_TICKER
from data_loader import InputData
from period_utils import (
    build_monthly_periods,
    build_periods,
    calculate_compound_return,
    calculate_forward_compounded_contribution,
    calculate_portfolio_period_returns,
    calculate_portfolio_ytd_return,
    expand_dates_with_month_ends,
    expand_weights_dict,
    group_months_by_quarter,
    group_periods_by_end_month,
    normalize_date,
    trim_month_keys_to_reporting_window,
)


Period = tuple[pd.Timestamp, pd.Timestamp]
MonthKey = tuple[int, int]


@dataclass
class TimelineData:
    imported_dates: list[pd.Timestamp]
    expanded_dates: list[pd.Timestamp]
    periods: list[Period]
    month_keys: list[MonthKey]
    month_groups: dict[MonthKey, list[tuple[int, Period]]]
    monthly_periods: list[Period]
    quarter_groups: list[tuple[list[MonthKey], bool]]


@dataclass
class QuarterLayout:
    monthly_tables: list[tuple[str, pd.DataFrame]]
    quarter_table: tuple[str, pd.DataFrame] | None


@dataclass
class MutualFundAuditTrace:
    raw_nav_inputs: list[tuple[pd.Timestamp, float]]
    reporting_boundaries: list[pd.Timestamp]
    resolved_boundary_prices: list[tuple[pd.Timestamp, float | None]]
    subperiod_rows: list[dict[str, object]]
    monthly_rows: list[dict[str, object]]
    quarter_rows: list[dict[str, object]]
    ytd_row: dict[str, object]


@dataclass
class ReportPayload:
    input_data: InputData
    timeline: TimelineData
    holding_facts: pd.DataFrame
    prices: dict[str, dict[pd.Timestamp, float | None]]
    period_df: pd.DataFrame
    monthly_df: pd.DataFrame
    period_benchmark_returns: dict[str, dict[Period, float]]
    monthly_benchmark_returns: dict[str, dict[Period, float]]
    period_benchmark_ytd_returns: dict[str, float]
    monthly_benchmark_ytd_returns: dict[str, float]
    portfolio_period_returns: dict[Period, float]
    portfolio_monthly_returns: dict[Period, float]
    portfolio_ytd_return: float
    top_contributor_layouts: list[QuarterLayout]
    mf_audit_traces: dict[str, MutualFundAuditTrace]


def build_timeline(imported_dates) -> TimelineData:
    normalized_imported_dates = [normalize_date(date) for date in imported_dates]
    expanded_dates = expand_dates_with_month_ends(normalized_imported_dates)
    periods = build_periods(expanded_dates)
    all_month_groups = group_periods_by_end_month(periods)
    month_keys = trim_month_keys_to_reporting_window(sorted(all_month_groups.keys()))
    month_groups = {month_key: all_month_groups[month_key] for month_key in month_keys}
    monthly_periods = build_monthly_periods(periods)
    monthly_periods = [
        period
        for period in monthly_periods
        if (period[1].year, period[1].month) in month_groups
    ]
    quarter_groups = group_months_by_quarter(month_keys)
    return TimelineData(
        imported_dates=normalized_imported_dates,
        expanded_dates=expanded_dates,
        periods=periods,
        month_keys=month_keys,
        month_groups=month_groups,
        monthly_periods=monthly_periods,
        quarter_groups=quarter_groups,
    )


def calculate_holding_span_returns(
    weights_dict,
    nav_dict,
    spans,
    prices,
    cache,
):
    """Compatibility helper for span returns sourced from boundary prices."""
    span_returns: dict[str, dict[Period, float]] = {}

    for ticker in sorted(weights_dict.keys()):
        span_returns[ticker] = {}
        for span in spans:
            start_date, end_date = span
            if ticker == CASH_TICKER:
                span_returns[ticker][span] = 0.0
                continue

            price_start = market_data.resolve_price_on_date(ticker, start_date, prices, nav_dict, cache)
            price_end = market_data.resolve_price_on_date(ticker, end_date, prices, nav_dict, cache)
            if price_start in (None, 0) or price_end is None:
                span_returns[ticker][span] = 0.0
                continue

            span_return = (price_end / price_start) - 1
            if market_data.needs_fx_adjustment(ticker, nav_dict):
                fx_return = market_data.get_fx_return(start_date, end_date, cache)
                span_return = (1.0 + span_return) * (1.0 + fx_return) - 1.0

            span_returns[ticker][span] = span_return

    return span_returns


def holding_facts_from_period_dataframe(period_df: pd.DataFrame, periods: list[Period]) -> pd.DataFrame:
    """Rebuild canonical holding facts from a wide period DataFrame."""
    rows = []

    for _, row_data in period_df.iterrows():
        ticker = row_data["Ticker"]
        for period_idx, period in enumerate(periods):
            rows.append(
                {
                    "Ticker": ticker,
                    "PeriodIndex": period_idx,
                    "StartDate": period[0],
                    "EndDate": period[1],
                    "Weight": float(row_data.get(f"Weight_{period_idx}", 0.0) or 0.0),
                    "Return": float(row_data.get(f"Return_{period_idx}", 0.0) or 0.0),
                    "Contrib": float(row_data.get(f"Contrib_{period_idx}", 0.0) or 0.0),
                }
            )

    return pd.DataFrame(rows)


def build_monthly_dataframe_from_facts(holding_facts: pd.DataFrame, monthly_periods: list[Period]) -> pd.DataFrame:
    """Compatibility helper for monthly wide output from canonical facts."""
    return _build_monthly_dataframe(holding_facts, monthly_periods)


def build_span_summary_from_period_dataframe(
    period_df: pd.DataFrame,
    periods: list[Period],
    span_periods: list[tuple[int, Period]],
) -> pd.DataFrame:
    """Compatibility helper for month/quarter aggregation from existing wide period data."""
    holding_facts = holding_facts_from_period_dataframe(period_df, periods)
    span_period_values = [period for _, period in sorted(span_periods, key=lambda item: item[1][0])]
    if not span_period_values:
        return pd.DataFrame()

    span = (span_period_values[0][0], span_period_values[-1][1])
    portfolio_period_returns = calculate_portfolio_period_returns(period_df, periods)
    portfolio_return = calculate_compound_return(portfolio_period_returns.get(period, 0.0) for period in span_period_values)
    return _build_span_summary_table(holding_facts, span, portfolio_return)


def build_quarter_summary_from_period_dataframe(
    period_df: pd.DataFrame,
    periods: list[Period],
    quarter_months: list[MonthKey],
    month_groups: dict[MonthKey, list[tuple[int, Period]]],
) -> pd.DataFrame:
    """Compatibility helper for quarter aggregation from existing wide period data."""
    span_periods = []
    for month_key in quarter_months:
        span_periods.extend(month_groups.get(month_key, []))
    return build_span_summary_from_period_dataframe(period_df, periods, span_periods)


def build_report_payload(input_data: InputData, cache: dict) -> ReportPayload:
    """Run the full chronological computation pipeline."""
    timeline = build_timeline(input_data.imported_dates)
    expanded_weights = expand_weights_dict(input_data.weights, timeline.expanded_dates)
    prices = _build_price_map(expanded_weights, input_data.navs, timeline.expanded_dates, cache)
    fx_returns = _build_fx_return_map(timeline.periods, cache)
    holding_facts = _build_holding_facts(expanded_weights, input_data.navs, timeline.periods, prices, fx_returns)
    period_df = _build_period_dataframe(holding_facts, timeline.periods)
    portfolio_period_returns = calculate_portfolio_period_returns(period_df, timeline.periods)
    portfolio_monthly_returns = _build_portfolio_span_returns(portfolio_period_returns, timeline.monthly_periods)
    portfolio_ytd_return = calculate_portfolio_ytd_return(portfolio_monthly_returns, timeline.monthly_periods)
    monthly_df = _build_monthly_dataframe(holding_facts, timeline.monthly_periods)
    period_benchmark_returns = _build_benchmark_period_returns(timeline.periods, timeline.expanded_dates, cache)
    monthly_benchmark_returns = _build_span_returns_from_period_returns(period_benchmark_returns, timeline.monthly_periods)
    period_benchmark_ytd_returns = {
        name: calculate_compound_return(returns.get(period, 0.0) for period in timeline.periods)
        for name, returns in period_benchmark_returns.items()
    }
    monthly_benchmark_ytd_returns = {
        name: calculate_compound_return(returns.get(period, 0.0) for period in timeline.monthly_periods)
        for name, returns in monthly_benchmark_returns.items()
    }
    top_contributor_layouts = _build_top_contributor_layouts(
        holding_facts,
        timeline,
        portfolio_period_returns,
    )
    mf_audit_traces = _build_mf_audit_traces(
        input_data,
        timeline,
        prices,
        holding_facts,
    )

    return ReportPayload(
        input_data=InputData(
            weights=expanded_weights,
            navs=input_data.navs,
            imported_dates=timeline.imported_dates,
        ),
        timeline=timeline,
        holding_facts=holding_facts,
        prices=prices,
        period_df=period_df,
        monthly_df=monthly_df,
        period_benchmark_returns=period_benchmark_returns,
        monthly_benchmark_returns=monthly_benchmark_returns,
        period_benchmark_ytd_returns=period_benchmark_ytd_returns,
        monthly_benchmark_ytd_returns=monthly_benchmark_ytd_returns,
        portfolio_period_returns=portfolio_period_returns,
        portfolio_monthly_returns=portfolio_monthly_returns,
        portfolio_ytd_return=portfolio_ytd_return,
        top_contributor_layouts=top_contributor_layouts,
        mf_audit_traces=mf_audit_traces,
    )


def print_mf_audit_trace(ticker: str, trace: MutualFundAuditTrace) -> None:
    """Print one deterministic console trace for a NAV-backed ticker."""
    print(f"\nMF AUDIT TRACE: {ticker}")
    print("Raw NAV Inputs")
    for nav_date, nav_value in trace.raw_nav_inputs:
        print(f"  {nav_date.strftime('%Y-%m-%d')}: {nav_value:.6f}")

    print("Reporting Boundaries")
    for boundary_date in trace.reporting_boundaries:
        print(f"  {boundary_date.strftime('%Y-%m-%d')}")

    print("Resolved Boundary Prices")
    for boundary_date, boundary_value in trace.resolved_boundary_prices:
        if boundary_value is None:
            rendered_value = "MISSING"
        else:
            rendered_value = f"{boundary_value:.6f}"
        print(f"  {boundary_date.strftime('%Y-%m-%d')}: {rendered_value}")

    print("Sub-Period Rows")
    for row in trace.subperiod_rows:
        price_start = "MISSING" if row["price_start"] is None else f"{row['price_start']:.6f}"
        price_end = "MISSING" if row["price_end"] is None else f"{row['price_end']:.6f}"
        print(
            "  "
            f"{row['start_date']} -> {row['end_date']} | "
            f"weight={row['weight']:.6f} | "
            f"start={price_start} | "
            f"end={price_end} | "
            f"return={row['return']:.6%} | "
            f"contrib={row['contrib']:.6%} | "
            f"needs_fx={row['needs_fx']}"
        )

    print("Monthly Rows")
    for row in trace.monthly_rows:
        start_value = "MISSING" if row["start_value"] is None else f"{row['start_value']:.6f}"
        end_value = "MISSING" if row["end_value"] is None else f"{row['end_value']:.6f}"
        print(
            "  "
            f"{row['label']} | "
            f"start={start_value} | "
            f"end={end_value} | "
            f"return={row['return']:.6%} | "
            f"contrib={row['contrib']:.6%}"
        )

    print("Quarter Rows")
    for row in trace.quarter_rows:
        start_value = "MISSING" if row["start_value"] is None else f"{row['start_value']:.6f}"
        end_value = "MISSING" if row["end_value"] is None else f"{row['end_value']:.6f}"
        print(
            "  "
            f"{row['label']} | "
            f"start={start_value} | "
            f"end={end_value} | "
            f"return={row['return']:.6%} | "
            f"contrib={row['contrib']:.6%}"
        )

    print("YTD Summary")
    start_value = "MISSING" if trace.ytd_row["start_value"] is None else f"{trace.ytd_row['start_value']:.6f}"
    end_value = "MISSING" if trace.ytd_row["end_value"] is None else f"{trace.ytd_row['end_value']:.6f}"
    print(
        "  "
        f"start={start_value} | "
        f"end={end_value} | "
        f"return={trace.ytd_row['return']:.6%} | "
        f"contrib={trace.ytd_row['contrib']:.6%}"
    )


def _build_price_map(weights_dict, nav_dict, boundary_dates, cache):
    prices: dict[str, dict[pd.Timestamp, float | None]] = {}

    for ticker in sorted(weights_dict.keys()):
        if ticker == CASH_TICKER:
            continue

        prices[ticker] = {}
        for boundary_date in boundary_dates:
            normalized_date = normalize_date(boundary_date)
            if ticker in nav_dict:
                prices[ticker][normalized_date] = market_data.get_nav_price_on_or_before(ticker, normalized_date, nav_dict)
            else:
                prices[ticker][normalized_date] = market_data.get_price_on_date(ticker, normalized_date, cache)

    return prices


def _build_fx_return_map(periods: list[Period], cache: dict) -> dict[Period, float]:
    return {period: market_data.get_fx_return(period[0], period[1], cache) for period in periods}


def _build_holding_facts(weights_dict, nav_dict, periods, prices, fx_returns) -> pd.DataFrame:
    rows = []

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
                    }
                )
                continue

            price_start = prices.get(ticker, {}).get(start_date)
            price_end = prices.get(ticker, {}).get(end_date)
            if price_start in (None, 0) or price_end is None:
                raise ValueError(f"Missing price data for {ticker} on {start_date} or {end_date}")

            period_return = (price_end / price_start) - 1.0
            needs_fx = market_data.needs_fx_adjustment(ticker, nav_dict)
            fx_return = fx_returns[period] if needs_fx else 0.0
            if needs_fx:
                period_return = (1.0 + period_return) * (1.0 + fx_return) - 1.0

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
                    "Return": period_return,
                    "Contrib": weight * period_return,
                }
            )

    holding_facts = pd.DataFrame(rows)
    if not holding_facts.empty:
        holding_facts = holding_facts.sort_values(["Ticker", "PeriodIndex"]).reset_index(drop=True)
    return holding_facts


def _build_period_dataframe(holding_facts: pd.DataFrame, periods: list[Period]) -> pd.DataFrame:
    rows = []

    for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True):
        ordered_facts = ticker_facts.sort_values("PeriodIndex")
        row = {"Ticker": ticker}
        ordered_weight_returns = []

        for _, fact in ordered_facts.iterrows():
            period_idx = int(fact["PeriodIndex"])
            row[f"Weight_{period_idx}"] = float(fact["Weight"])
            row[f"Return_{period_idx}"] = float(fact["Return"])
            row[f"Contrib_{period_idx}"] = float(fact["Contrib"])
            ordered_weight_returns.append((float(fact["Weight"]), float(fact["Return"])))

        if ticker == CASH_TICKER:
            row["YTD_Return"] = 0.0
            row["YTD_Contrib"] = 0.0
        else:
            row["YTD_Return"] = calculate_compound_return(fact["Return"] for _, fact in ordered_facts.iterrows())
            row["YTD_Contrib"] = calculate_forward_compounded_contribution(ordered_weight_returns)

        rows.append(row)

    period_df = pd.DataFrame(rows)
    if not period_df.empty and "YTD_Contrib" in period_df.columns:
        period_df = period_df.sort_values("YTD_Contrib", ascending=False).reset_index(drop=True)
    return period_df


def _build_monthly_dataframe(holding_facts: pd.DataFrame, monthly_periods: list[Period]) -> pd.DataFrame:
    ticker_groups = {
        ticker: ticker_facts.sort_values("PeriodIndex")
        for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True)
    }
    rows = []

    for ticker, ticker_facts in ticker_groups.items():
        row = {"Ticker": ticker}
        monthly_returns = []

        for period_idx, monthly_period in enumerate(monthly_periods):
            span_facts = _select_facts_in_span(ticker_facts, monthly_period)
            if span_facts.empty or ticker == CASH_TICKER:
                span_return = 0.0
                span_contrib = 0.0
            else:
                span_return = calculate_compound_return(span_facts["Return"].tolist())
                span_contrib = calculate_forward_compounded_contribution(
                    list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist()))
                )

            row[f"Return_{period_idx}"] = span_return
            row[f"Contrib_{period_idx}"] = span_contrib
            monthly_returns.append(span_return)

        if ticker == CASH_TICKER:
            row["YTD_Return"] = 0.0
            row["YTD_Contrib"] = 0.0
        else:
            row["YTD_Return"] = calculate_compound_return(monthly_returns)
            row["YTD_Contrib"] = calculate_forward_compounded_contribution(
                list(zip(ticker_facts["Weight"].tolist(), ticker_facts["Return"].tolist()))
            )

        rows.append(row)

    monthly_df = pd.DataFrame(rows)
    if not monthly_df.empty and "YTD_Contrib" in monthly_df.columns:
        monthly_df = monthly_df.sort_values("YTD_Contrib", ascending=False).reset_index(drop=True)
    return monthly_df


def _build_benchmark_period_returns(periods: list[Period], boundary_dates: list[pd.Timestamp], cache: dict) -> dict[str, dict[Period, float]]:
    benchmark_prices = _build_price_map_for_tickers(
        [ticker for ticker in BENCHMARK_TICKERS.values() if ticker != FX_TICKER],
        boundary_dates,
        cache,
    )
    fx_returns = _build_fx_return_map(periods, cache)
    benchmark_returns: dict[str, dict[Period, float]] = {}

    for benchmark_name, ticker in BENCHMARK_TICKERS.items():
        benchmark_returns[benchmark_name] = {}
        for period in periods:
            if ticker == FX_TICKER:
                benchmark_returns[benchmark_name][period] = fx_returns[period]
                continue

            price_start = benchmark_prices[ticker][period[0]]
            price_end = benchmark_prices[ticker][period[1]]
            benchmark_returns[benchmark_name][period] = (price_end / price_start) - 1.0

    return benchmark_returns


def _build_price_map_for_tickers(tickers, boundary_dates, cache):
    prices = {}
    for ticker in tickers:
        prices[ticker] = {}
        for boundary_date in boundary_dates:
            normalized_date = normalize_date(boundary_date)
            prices[ticker][normalized_date] = market_data.get_price_on_date(ticker, normalized_date, cache)
    return prices


def _build_span_returns_from_period_returns(
    period_returns: dict[str, dict[Period, float]],
    spans: list[Period],
) -> dict[str, dict[Period, float]]:
    span_returns: dict[str, dict[Period, float]] = {}

    for series_name, series_returns in period_returns.items():
        span_returns[series_name] = {}
        for span in spans:
            relevant_returns = [
                series_returns.get(period, 0.0)
                for period in series_returns
                if period[0] >= span[0] and period[1] <= span[1]
            ]
            span_returns[series_name][span] = calculate_compound_return(relevant_returns)

    return span_returns


def _build_portfolio_span_returns(portfolio_period_returns, spans):
    return {
        span: calculate_compound_return(
            portfolio_period_returns.get(period, 0.0)
            for period in portfolio_period_returns
            if period[0] >= span[0] and period[1] <= span[1]
        )
        for span in spans
    }


def _build_top_contributor_layouts(
    holding_facts: pd.DataFrame,
    timeline: TimelineData,
    portfolio_period_returns: dict[Period, float],
) -> list[QuarterLayout]:
    monthly_tables_by_key: dict[MonthKey, tuple[str, pd.DataFrame]] = {}

    for month_key in timeline.month_keys:
        month_periods = timeline.month_groups.get(month_key, [])
        if not month_periods:
            continue

        ordered_month_periods = [period for _, period in sorted(month_periods, key=lambda item: item[1][0])]
        month_span = (ordered_month_periods[0][0], ordered_month_periods[-1][1])
        month_title = pd.Timestamp(year=month_key[0], month=month_key[1], day=1).strftime("%B %Y")
        portfolio_return = calculate_compound_return(portfolio_period_returns.get(period, 0.0) for period in ordered_month_periods)
        monthly_tables_by_key[month_key] = (month_title, _build_span_summary_table(holding_facts, month_span, portfolio_return))

    layouts = []
    for quarter_months, _ in timeline.quarter_groups:
        monthly_tables = [monthly_tables_by_key[month_key] for month_key in quarter_months if month_key in monthly_tables_by_key]
        quarter_table = None

        if monthly_tables:
            first_month_key = quarter_months[0]
            last_month_key = quarter_months[-1]
            first_periods = [period for _, period in timeline.month_groups[first_month_key]]
            last_periods = [period for _, period in timeline.month_groups[last_month_key]]
            quarter_span = (first_periods[0][0], last_periods[-1][1])
            quarter_periods = []
            for month_key in quarter_months:
                quarter_periods.extend(period for _, period in timeline.month_groups[month_key])
            portfolio_return = calculate_compound_return(portfolio_period_returns.get(period, 0.0) for period in quarter_periods)
            quarter_number = ((first_month_key[1] - 1) // 3) + 1
            quarter_table = (f"Q{quarter_number}", _build_span_summary_table(holding_facts, quarter_span, portfolio_return))

        layouts.append(QuarterLayout(monthly_tables=monthly_tables, quarter_table=quarter_table))

    return layouts


def _build_mf_audit_traces(
    input_data: InputData,
    timeline: TimelineData,
    prices: dict[str, dict[pd.Timestamp, float | None]],
    holding_facts: pd.DataFrame,
) -> dict[str, MutualFundAuditTrace]:
    traces = {}

    for ticker in sorted(input_data.navs.keys()):
        traces[ticker] = _build_mf_audit_trace(
            ticker,
            input_data.navs.get(ticker, {}),
            timeline,
            prices.get(ticker, {}),
            holding_facts,
        )

    return traces


def _build_mf_audit_trace(
    ticker: str,
    raw_navs: dict[pd.Timestamp, float],
    timeline: TimelineData,
    price_series: dict[pd.Timestamp, float | None],
    holding_facts: pd.DataFrame,
) -> MutualFundAuditTrace:
    ticker_facts = holding_facts.loc[holding_facts["Ticker"] == ticker].sort_values("PeriodIndex")

    raw_nav_inputs = [
        (normalize_date(nav_date), float(nav_value))
        for nav_date, nav_value in sorted(raw_navs.items(), key=lambda item: normalize_date(item[0]))
    ]
    reporting_boundaries = list(timeline.expanded_dates)
    resolved_boundary_prices = [
        (boundary_date, price_series.get(boundary_date))
        for boundary_date in reporting_boundaries
    ]

    subperiod_rows = []
    for _, fact in ticker_facts.iterrows():
        price_start = fact["PriceStart"]
        price_end = fact["PriceEnd"]
        subperiod_rows.append(
            {
                "start_date": fact["StartDate"].strftime("%Y-%m-%d"),
                "end_date": fact["EndDate"].strftime("%Y-%m-%d"),
                "weight": float(fact["Weight"]),
                "price_start": None if pd.isna(price_start) else float(price_start),
                "price_end": None if pd.isna(price_end) else float(price_end),
                "return": float(fact["Return"]),
                "contrib": float(fact["Contrib"]),
                "needs_fx": bool(fact["NeedsFx"]),
            }
        )

    monthly_rows = []
    for monthly_period in timeline.monthly_periods:
        span_facts = _select_facts_in_span(ticker_facts, monthly_period)
        if span_facts.empty:
            continue

        monthly_rows.append(
            {
                "label": f"{monthly_period[0].strftime('%Y-%m-%d')} -> {monthly_period[1].strftime('%Y-%m-%d')}",
                "start_value": _safe_float(price_series.get(monthly_period[0])),
                "end_value": _safe_float(price_series.get(monthly_period[1])),
                "return": calculate_compound_return(span_facts["Return"].tolist()),
                "contrib": calculate_forward_compounded_contribution(
                    list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist()))
                ),
            }
        )

    quarter_rows = []
    quarter_number = 1
    for quarter_months, has_quarter in timeline.quarter_groups:
        if not has_quarter:
            continue

        quarter_start = timeline.month_groups[quarter_months[0]][0][1][0]
        quarter_end = timeline.month_groups[quarter_months[-1]][-1][1][1]
        span_facts = _select_facts_in_span(ticker_facts, (quarter_start, quarter_end))
        if span_facts.empty:
            continue

        quarter_rows.append(
            {
                "label": f"Q{quarter_number}",
                "start_value": _safe_float(price_series.get(quarter_start)),
                "end_value": _safe_float(price_series.get(quarter_end)),
                "return": calculate_compound_return(span_facts["Return"].tolist()),
                "contrib": calculate_forward_compounded_contribution(
                    list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist()))
                ),
            }
        )
        quarter_number += 1

    if ticker_facts.empty:
        ytd_row = {
            "start_value": 0.0,
            "end_value": 0.0,
            "return": 0.0,
            "contrib": 0.0,
        }
    else:
        first_boundary = timeline.expanded_dates[0]
        last_boundary = timeline.expanded_dates[-1]
        ytd_row = {
            "start_value": _safe_float(price_series.get(first_boundary)),
            "end_value": _safe_float(price_series.get(last_boundary)),
            "return": calculate_compound_return(ticker_facts["Return"].tolist()),
            "contrib": calculate_forward_compounded_contribution(
                list(zip(ticker_facts["Weight"].tolist(), ticker_facts["Return"].tolist()))
            ),
        }

    return MutualFundAuditTrace(
        raw_nav_inputs=raw_nav_inputs,
        reporting_boundaries=reporting_boundaries,
        resolved_boundary_prices=resolved_boundary_prices,
        subperiod_rows=subperiod_rows,
        monthly_rows=monthly_rows,
        quarter_rows=quarter_rows,
        ytd_row=ytd_row,
    )


def _build_span_summary_table(holding_facts: pd.DataFrame, span: Period, portfolio_return: float) -> pd.DataFrame:
    rows = []

    for ticker, ticker_facts in holding_facts.groupby("Ticker", sort=True):
        span_facts = _select_facts_in_span(ticker_facts.sort_values("PeriodIndex"), span)
        if span_facts.empty or ticker == CASH_TICKER:
            weight = float(span_facts["Weight"].iloc[-1]) if not span_facts.empty else 0.0
            span_return = 0.0
            span_contrib = 0.0
        else:
            weight = float(span_facts["Weight"].iloc[-1])
            span_return = calculate_compound_return(span_facts["Return"].tolist())
            span_contrib = calculate_forward_compounded_contribution(
                list(zip(span_facts["Weight"].tolist(), span_facts["Return"].tolist()))
            )

        rows.append(
            {
                "Ticker": ticker,
                "Weight": weight,
                "Return": span_return,
                "Contrib": span_contrib,
            }
        )

    span_df = pd.DataFrame(rows)
    span_df.attrs["portfolio_return"] = portfolio_return
    return span_df


def _select_facts_in_span(ticker_facts: pd.DataFrame, span: Period) -> pd.DataFrame:
    span_start, span_end = span
    return ticker_facts[
        (ticker_facts["StartDate"] >= span_start)
        & (ticker_facts["EndDate"] <= span_end)
    ].copy()


def _safe_float(value):
    if value is None or pd.isna(value):
        return None
    return float(value)
