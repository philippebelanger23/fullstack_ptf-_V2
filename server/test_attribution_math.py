"""Unit tests for the canonical attribution math helpers and refactored builders."""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from services.attribution_math import (
    apply_fx_adjustment,
    forward_compound_series,
    forward_compounded_contribution,
    geometric_chain,
    price_return,
)
from market_data import build_results_dataframe, build_monthly_dataframe


def _ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value)


def test_core_math_helpers_match_expected_formulas():
    assert abs(price_return(100, 110) - 0.10) < 1e-12
    assert price_return(None, 110) == 0.0

    adjusted = apply_fx_adjustment(0.05, 0.02, True)
    assert abs(adjusted - ((1.05 * 1.02) - 1)) < 1e-12

    returns = [0.05, -0.02, 0.04]
    assert abs(geometric_chain(returns) - ((1.05 * 0.98 * 1.04) - 1)) < 1e-12

    values = [0.005, -0.002, 0.004]
    assert abs(
        forward_compound_series(values, returns)
        - (0.005 * 0.98 * 1.04 + (-0.002) * 1.04 + 0.004)
    ) < 1e-12

    sub_data = [(0.10, 0.05), (0.10, -0.02), (0.10, 0.04)]
    assert abs(
        forward_compounded_contribution(sub_data)
        - (0.10 * 0.05 * 0.98 * 1.04 + 0.10 * (-0.02) * 1.04 + 0.10 * 0.04)
    ) < 1e-12


def test_refactored_builders_reconcile_period_and_monthly_ytd_contributions():
    dates = [_ts("2025-12-31"), _ts("2026-01-15"), _ts("2026-01-31"), _ts("2026-02-10")]
    periods = list(zip(dates[:-1], dates[1:]))

    weights_dict = {
        "AAA": {
            _ts("2025-12-31"): 0.10,
            _ts("2026-01-15"): 0.10,
            _ts("2026-01-31"): 0.10,
        }
    }
    returns = {
        "AAA": {
            periods[0]: 0.05,
            periods[1]: -0.02,
            periods[2]: 0.04,
        }
    }
    prices = {
        "AAA": {
            _ts("2025-12-31"): 100.0,
            _ts("2026-01-31"): 102.9,
            _ts("2026-02-10"): 107.016,
        }
    }

    period_df, built_periods = build_results_dataframe(
        weights_dict,
        returns,
        prices,
        dates,
        cache={},
        mutual_fund_tickers=set(),
        custom_sectors=None,
        nav_dict={},
    )
    assert built_periods == periods

    row = period_df[period_df["Ticker"] == "AAA"].iloc[0]
    assert abs(row["YTD_Return"] - ((1.05 * 0.98 * 1.04) - 1)) < 1e-12
    assert abs(
        row["YTD_Contrib"]
        - (0.10 * 0.05 * 0.98 * 1.04 + 0.10 * (-0.02) * 1.04 + 0.10 * 0.04)
    ) < 1e-12

    monthly_periods = [
        (_ts("2025-12-31"), _ts("2026-01-31")),
        (_ts("2026-01-31"), _ts("2026-02-10")),
    ]
    monthly_period_df = pd.DataFrame(
        [
            {
                "Ticker": "AAA",
                "Weight_0": 0.10,
                "Return_0": 0.05,
                "Contrib_0": 0.005,
                "Weight_1": 0.10,
                "Return_1": -0.02,
                "Contrib_1": -0.002,
                "Weight_2": 0.10,
                "Return_2": 0.04,
                "Contrib_2": 0.004,
            }
        ]
    )

    monthly_df = build_monthly_dataframe(
        weights_dict,
        monthly_periods,
        periods,
        monthly_period_df,
        prices,
        cache={},
        nav_dict={},
        mutual_fund_tickers=set(),
    )

    mrow = monthly_df[monthly_df["Ticker"] == "AAA"].iloc[0]
    assert abs(mrow["YTD_Return"] - ((1.05 * 0.98 * 1.04) - 1)) < 1e-12
    assert abs(mrow["YTD_Contrib"] - row["YTD_Contrib"]) < 1e-12


def test_nav_backed_ticker_does_not_get_fx_adjusted_in_period_sheet(monkeypatch):
    dates = [_ts("2025-12-31"), _ts("2026-01-31")]
    periods = list(zip(dates[:-1], dates[1:]))

    weights_dict = {
        "MF1": {
            _ts("2025-12-31"): 0.10,
        }
    }
    returns = {
        "MF1": {
            periods[0]: 0.10,
        }
    }
    prices = {
        "MF1": {
            _ts("2025-12-31"): 100.0,
            _ts("2026-01-31"): 110.0,
        }
    }
    nav_dict = {
        "MF1": {
            _ts("2025-12-31"): 100.0,
            _ts("2026-01-31"): 110.0,
        }
    }

    def _fail_fx_lookup(ticker, date, cache):
        from constants import FX_TICKER

        if ticker == FX_TICKER:
            raise AssertionError("NAV-backed tickers should not fetch FX")
        return 1.0

    monkeypatch.setattr("market_data.get_price_on_date", _fail_fx_lookup)

    period_df, _ = build_results_dataframe(
        weights_dict,
        returns,
        prices,
        dates,
        cache={},
        mutual_fund_tickers=set(),
        custom_sectors=None,
        nav_dict=nav_dict,
    )

    row = period_df[period_df["Ticker"] == "MF1"].iloc[0]
    assert abs(row["YTD_Return"] - 0.10) < 1e-12


def test_build_monthly_dataframe_resolves_nav_boundaries_from_nav_dict_when_prices_missing():
    monthly_periods = [(_ts("2025-12-31"), _ts("2026-01-31"))]
    periods = [(_ts("2025-12-31"), _ts("2026-01-08")), (_ts("2026-01-08"), _ts("2026-01-31"))]
    weights_dict = {"DYN245": {_ts("2025-12-31"): 0.065, _ts("2026-01-08"): 0.065}}
    period_df = pd.DataFrame(
        [
            {
                "Ticker": "DYN245",
                "Weight_0": 0.065,
                "Return_0": (28.0253 / 31.5615) - 1,
                "Contrib_0": 0.065 * ((28.0253 / 31.5615) - 1),
                "Weight_1": 0.065,
                "Return_1": (25.5191 / 28.0253) - 1,
                "Contrib_1": 0.065 * ((25.5191 / 28.0253) - 1),
            }
        ]
    )
    nav_dict = {
        "DYN245": {
            "2025-12-31T16:00:00": 31.5615,
            "2026-01-08T16:00:00": 28.0253,
            "2026-01-30T16:00:00": 25.5191,
        }
    }
    prices = {
        "DYN245": {
            _ts("2025-12-31"): 31.5615,
            _ts("2026-01-08"): 28.0253,
        }
    }

    monthly_df = build_monthly_dataframe(
        weights_dict,
        monthly_periods,
        periods,
        period_df,
        prices,
        cache={},
        nav_dict=nav_dict,
        mutual_fund_tickers={"DYN245"},
    )

    row = monthly_df[monthly_df["Ticker"] == "DYN245"].iloc[0]
    expected_return = (25.5191 / 31.5615) - 1

    assert round(row["Return_0"] * 100, 6) == round(expected_return * 100, 6)
