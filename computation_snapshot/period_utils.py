"""Shared period and portfolio rollup helpers."""

import pandas as pd


def normalize_date(value):
    """Convert a date-like value to a normalized Timestamp."""
    return pd.to_datetime(value).normalize()


def normalize_dates(dates):
    """Return sorted unique normalized dates."""
    return sorted(dict.fromkeys(normalize_date(date) for date in dates))


def build_periods(dates):
    """Build consecutive sub-periods from an ordered date list."""
    normalized_dates = normalize_dates(dates)
    return list(zip(normalized_dates[:-1], normalized_dates[1:]))


def expand_dates_with_month_ends(dates):
    """Insert month-end boundaries between existing dates and after the final date."""
    normalized_dates = normalize_dates(dates)
    if len(normalized_dates) < 2:
        if not normalized_dates:
            return normalized_dates
        final_month_end = (normalized_dates[-1] + pd.offsets.MonthEnd(0)).normalize()
        if final_month_end > normalized_dates[-1]:
            return normalized_dates + [final_month_end]
        return normalized_dates

    expanded_dates = set(normalized_dates)

    for start_date, end_date in zip(normalized_dates, normalized_dates[1:]):
        month_end = (start_date + pd.offsets.MonthEnd(0)).normalize()
        if month_end <= start_date:
            month_end = (start_date + pd.offsets.MonthEnd(1)).normalize()

        while month_end < end_date:
            expanded_dates.add(month_end)
            month_end = (month_end + pd.offsets.MonthEnd(1)).normalize()

    final_date = normalized_dates[-1]
    final_month_end = (final_date + pd.offsets.MonthEnd(0)).normalize()
    if final_month_end > final_date:
        expanded_dates.add(final_month_end)

    return sorted(expanded_dates)


def expand_weights_dict(weights_dict, dates):
    """Forward-fill weights onto any inserted boundary dates."""
    normalized_dates = normalize_dates(dates)
    expanded_weights = {}

    for ticker, ticker_weights in weights_dict.items():
        normalized_weights = {
            normalize_date(date): float(weight)
            for date, weight in ticker_weights.items()
        }

        expanded_weights[ticker] = {}
        last_weight = None

        for current_date in normalized_dates:
            if current_date in normalized_weights:
                last_weight = normalized_weights[current_date]
            if last_weight is not None:
                expanded_weights[ticker][current_date] = last_weight

    return expanded_weights


def group_periods_by_end_month(periods):
    """Group sub-periods by the month of their end date."""
    month_groups = {}
    for period_idx, period in enumerate(periods):
        month_key = (period[1].year, period[1].month)
        month_groups.setdefault(month_key, []).append((period_idx, period))
    return month_groups


def build_monthly_periods(periods):
    """Build reporting month spans in chronological order from sub-periods."""
    monthly_periods = []
    for _, month_periods in sorted(group_periods_by_end_month(periods).items()):
        ordered_periods = sorted(month_periods, key=lambda item: item[1][0])
        if not ordered_periods:
            continue
        monthly_periods.append((ordered_periods[0][1][0], ordered_periods[-1][1][1]))
    return monthly_periods


def trim_month_keys_to_reporting_window(month_keys):
    """Start month-based reporting from the first January when available."""
    if not month_keys:
        return []

    first_january_idx = next((idx for idx, (_, month) in enumerate(month_keys) if month == 1), 0)
    return month_keys[first_january_idx:]


def group_months_by_quarter(month_keys):
    """Group reporting months into chronological quarter-sized chunks."""
    quarter_groups = []
    for index in range(0, len(month_keys), 3):
        quarter_months = month_keys[index:index + 3]
        quarter_groups.append((quarter_months, len(quarter_months) == 3))
    return quarter_groups


def is_month_end(date_value):
    """Return True when the date is the final calendar day of its month."""
    date_value = normalize_date(date_value)
    return date_value == (date_value + pd.offsets.MonthEnd(0)).normalize()


def get_full_month_periods(periods):
    """Return only complete month spans keyed by their end month."""
    full_month_periods = []

    for month_key, month_periods in sorted(group_periods_by_end_month(periods).items()):
        ordered_periods = sorted(month_periods, key=lambda item: item[1][0])
        if not ordered_periods:
            continue

        month_start = ordered_periods[0][1][0]
        month_end = ordered_periods[-1][1][1]
        expected_start = (month_end - pd.offsets.MonthEnd(1)).normalize()

        if month_start == expected_start and is_month_end(month_end):
            full_month_periods.append((month_key, (month_start, month_end), ordered_periods))

    return full_month_periods


def calculate_compound_return(returns):
    """Compound an ordered series of returns."""
    compounded = 1.0
    for return_value in returns:
        compounded *= (1.0 + return_value)
    return compounded - 1.0


def calculate_forward_compounded_contribution(weight_returns):
    """Forward-compound sub-period contributions through the remaining returns."""
    ordered_weight_returns = list(weight_returns)
    contribution = 0.0

    for period_idx, (weight_value, return_value) in enumerate(ordered_weight_returns):
        forward_factor = 1.0
        for _, later_return in ordered_weight_returns[period_idx + 1:]:
            forward_factor *= 1.0 + later_return
        contribution += weight_value * return_value * forward_factor

    return contribution


def calculate_portfolio_period_returns(period_df, periods):
    """Portfolio sub-period return is the sum of holding contributions."""
    portfolio_period_returns = {}
    for period_idx, period in enumerate(periods):
        contrib_col = f"Contrib_{period_idx}"
        portfolio_period_returns[period] = (
            float(period_df[contrib_col].sum()) if contrib_col in period_df.columns else 0.0
        )
    return portfolio_period_returns


def calculate_portfolio_span_return(periods, portfolio_period_returns, span_start, span_end):
    """Compound portfolio sub-period returns inside one reporting span."""
    span_returns = []
    for period in periods:
        if period[0] >= span_start and period[1] <= span_end:
            span_returns.append(portfolio_period_returns.get(period, 0.0))
    return calculate_compound_return(span_returns)


def calculate_portfolio_monthly_returns(period_df, periods, monthly_periods):
    """Calculate compounded portfolio return for each monthly span."""
    portfolio_period_returns = calculate_portfolio_period_returns(period_df, periods)
    portfolio_monthly_returns = {}

    for monthly_period in monthly_periods:
        portfolio_monthly_returns[monthly_period] = calculate_portfolio_span_return(
            periods,
            portfolio_period_returns,
            monthly_period[0],
            monthly_period[1],
        )

    return portfolio_monthly_returns


def calculate_portfolio_ytd_return(portfolio_monthly_returns, monthly_periods):
    """Compound monthly portfolio returns to YTD."""
    return calculate_compound_return(
        portfolio_monthly_returns.get(monthly_period, 0.0)
        for monthly_period in monthly_periods
    )
