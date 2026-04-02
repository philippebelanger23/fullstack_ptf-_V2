"""Canonical portfolio period normalization helpers."""

from __future__ import annotations

from typing import Iterable

import pandas as pd


def _normalize_timestamp(value) -> pd.Timestamp:
    return pd.Timestamp(value).normalize()


def _previous_month_end(date: pd.Timestamp) -> pd.Timestamp:
    return (date.replace(day=1) - pd.Timedelta(days=1)).normalize()


def _copy_weights_forward(
    weights_dict: dict[str, dict[pd.Timestamp, float]],
    target_date: pd.Timestamp,
) -> None:
    """Carry the latest known weight snapshot forward to ``target_date``."""
    for ticker, date_map in weights_dict.items():
        prior_dates = [d for d in date_map.keys() if d <= target_date]
        if prior_dates:
            date_map[target_date] = date_map[max(prior_dates)]


def normalize_portfolio_periods(
    weights_dict: dict[str, dict[pd.Timestamp, float]],
    dates: Iterable[pd.Timestamp | str],
    now: pd.Timestamp | None = None,
) -> tuple[dict[str, dict[pd.Timestamp, float]], list[pd.Timestamp]]:
    """
    Normalize rebalance dates into a canonical analysis timeline.

    Rules:
    - Keep the user-supplied dates as the primary boundary set.
    - Insert month-end boundaries between any two dates that span a month.
    - If the first boundary is the first day of a month, prepend the prior
      month-end so the month can be measured from day1 - 1.
    - Carry the latest known weights forward onto every synthetic date.
    - Extend the series to today if the last boundary is in the past, or add a
      one-day synthetic endpoint if the last boundary is today/future.
    """
    normalized_weights: dict[str, dict[pd.Timestamp, float]] = {
        ticker: {
            _normalize_timestamp(date): float(weight)
            for date, weight in date_map.items()
        }
        for ticker, date_map in (weights_dict or {}).items()
    }

    normalized_dates = sorted(
        {
            _normalize_timestamp(date)
            for date in dates
            if date is not None
        }
    )
    if not normalized_dates:
        return normalized_weights, []

    current_day = _normalize_timestamp(now) if now is not None else pd.Timestamp.now().normalize()

    # Only prepend the previous month-end when the first date is a true month
    # start. That preserves the "day1 - 1" convention without inventing an
    # extra month before a portfolio that already starts on a month-end.
    earliest_date = normalized_dates[0]
    if earliest_date.day == 1:
        prior_month_end = _previous_month_end(earliest_date)
        if prior_month_end not in normalized_dates:
            normalized_dates.insert(0, prior_month_end)
            _copy_weights_forward(normalized_weights, prior_month_end)
            # If no earlier snapshot exists, backfill the earliest snapshot so
            # the initial month still has a usable weight base.
            for ticker, date_map in normalized_weights.items():
                if prior_month_end not in date_map and earliest_date in date_map:
                    date_map[prior_month_end] = date_map[earliest_date]

    # Inject month-ends between any two user dates that span a month boundary.
    original_dates = list(normalized_dates)
    extra_dates: set[pd.Timestamp] = set()
    for start_date, end_date in zip(original_dates, original_dates[1:]):
        if start_date.month != end_date.month or start_date.year != end_date.year:
            for month_end in pd.date_range(
                start=start_date + pd.DateOffset(days=1),
                end=end_date - pd.DateOffset(days=1),
                freq="ME",
            ):
                extra_dates.add(_normalize_timestamp(month_end))

    for synthetic_date in sorted(extra_dates):
        if synthetic_date not in normalized_dates:
            normalized_dates.append(synthetic_date)
            normalized_dates.sort()
        _copy_weights_forward(normalized_weights, synthetic_date)

    latest_date = normalized_dates[-1]
    if latest_date < current_day:
        for month_end in pd.date_range(
            start=latest_date + pd.DateOffset(days=1),
            end=current_day,
            freq="ME",
        ):
            synthetic_date = _normalize_timestamp(month_end)
            if synthetic_date not in normalized_dates:
                normalized_dates.append(synthetic_date)
                normalized_dates.sort()
            _copy_weights_forward(normalized_weights, synthetic_date)

        if current_day not in normalized_dates:
            normalized_dates.append(current_day)
            normalized_dates.sort()
        _copy_weights_forward(normalized_weights, current_day)
    else:
        synthetic_date = latest_date + pd.Timedelta(days=1)
        if synthetic_date not in normalized_dates:
            normalized_dates.append(synthetic_date)
            normalized_dates.sort()
        _copy_weights_forward(normalized_weights, synthetic_date)

    return normalized_weights, sorted(set(normalized_dates))
