"""Unit-contract tests for live weight, return, and contribution payloads."""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from services.backcast_service import aggregate_period_weights, aggregate_weights, compute_period_attribution


def _item(ticker: str, weight: float, date: str, is_mutual_fund: bool = False):
    return type(
        "Item",
        (),
        {
            "ticker": ticker,
            "weight": weight,
            "date": date,
            "isMutualFund": is_mutual_fund,
        },
    )()


def test_aggregate_helpers_convert_percent_form_items_to_decimal_weights():
    items = [
        _item("AAA", 60.0, "2026-01-31"),
        _item("BBB", 40.0, "2026-01-31"),
    ]

    weights_by_ticker, mutual_funds = aggregate_weights(items)
    period_weights = aggregate_period_weights(items)

    assert mutual_funds == set()
    assert weights_by_ticker == {"AAA": 0.6, "BBB": 0.4}
    assert period_weights == [("2026-01-31", {"AAA": 0.6, "BBB": 0.4}, set())]


def test_compute_period_attribution_returns_percent_form_weight_and_contribution():
    returns_df = pd.DataFrame(
        {
            "AAA": [0.10, -0.05],
        },
        index=pd.to_datetime(["2026-01-01", "2026-01-02"]),
    )
    period_weights = [("2026-01-02", {"AAA": 0.25}, set())]

    result = compute_period_attribution(returns_df, period_weights)

    assert len(result) == 1
    assert result[0]["ticker"] == "AAA"
    assert result[0]["weight"] == 25.0
    assert round(result[0]["returnPct"], 6) == round((1.10 * 0.95) - 1.0, 6)
    assert round(result[0]["contribution"], 6) == round(25.0 * (((1.10 * 0.95) - 1.0)), 6)
