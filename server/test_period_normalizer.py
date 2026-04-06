"""
Unit tests for the canonical portfolio period normalizer.

Phase 1 scope:
- month-end boundaries are inserted between rebalance dates
- weights are carried forward onto synthetic dates
- the first-date rule only prepends a prior month-end when the portfolio
  starts on the first day of a month
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from services.period_normalizer import normalize_portfolio_periods
from market_data import create_monthly_periods


def _ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value)


def _to_dates(values):
    return [pd.Timestamp(value) for value in values]


def test_inserts_month_end_between_rebalance_dates_and_carries_weights():
    weights = {
        "AAA": {
            _ts("2025-12-31"): 1.00,
            _ts("2026-01-15"): 1.10,
            _ts("2026-02-10"): 1.20,
        }
    }

    normalized_weights, normalized_dates = normalize_portfolio_periods(
        weights,
        _to_dates(["2025-12-31", "2026-01-15", "2026-02-10"]),
        now=_ts("2026-02-11"),
    )

    assert normalized_dates == _to_dates([
        "2025-12-31",
        "2026-01-15",
        "2026-01-31",
        "2026-02-10",
        "2026-02-11",
    ])
    assert normalized_weights["AAA"][_ts("2026-01-31")] == 1.10
    assert normalized_weights["AAA"][_ts("2026-02-11")] == 1.20
    assert _ts("2025-11-30") not in normalized_dates


def test_prepends_prior_month_end_only_when_first_date_is_month_start():
    weights = {
        "AAA": {
            _ts("2026-01-01"): 1.00,
            _ts("2026-01-15"): 1.10,
        }
    }

    normalized_weights, normalized_dates = normalize_portfolio_periods(
        weights,
        _to_dates(["2026-01-01", "2026-01-15"]),
        now=_ts("2026-01-16"),
    )

    assert normalized_dates[0] == _ts("2025-12-31")
    assert normalized_weights["AAA"][_ts("2025-12-31")] == 1.00
    assert normalized_weights["AAA"][_ts("2026-01-15")] == 1.10
    assert normalized_weights["AAA"][_ts("2026-01-16")] == 1.10


def test_inserts_multiple_month_ends_for_long_gaps():
    weights = {
        "AAA": {
            _ts("2026-01-15"): 1.00,
            _ts("2026-03-10"): 1.20,
        }
    }

    normalized_weights, normalized_dates = normalize_portfolio_periods(
        weights,
        _to_dates(["2026-01-15", "2026-03-10"]),
        now=_ts("2026-03-11"),
    )

    assert _ts("2026-01-31") in normalized_dates
    assert _ts("2026-02-28") in normalized_dates
    assert normalized_weights["AAA"][_ts("2026-01-31")] == 1.00
    assert normalized_weights["AAA"][_ts("2026-02-28")] == 1.00
    assert normalized_weights["AAA"][_ts("2026-03-11")] == 1.20


def test_create_monthly_periods_uses_calendar_month_boundaries():
    periods = [
        (_ts("2025-12-31"), _ts("2026-01-15")),
        (_ts("2026-01-15"), _ts("2026-01-31")),
        (_ts("2026-01-31"), _ts("2026-02-10")),
        (_ts("2026-02-10"), _ts("2026-02-28")),
        (_ts("2026-02-28"), _ts("2026-03-15")),
        (_ts("2026-03-15"), _ts("2026-03-31")),
        (_ts("2026-03-31"), _ts("2026-04-02")),
    ]

    monthly_periods = create_monthly_periods(periods)

    assert monthly_periods == [
        (_ts("2025-12-31"), _ts("2026-01-31")),
        (_ts("2026-01-31"), _ts("2026-02-28")),
        (_ts("2026-02-28"), _ts("2026-03-31")),
        (_ts("2026-03-31"), _ts("2026-04-02")),
    ]
