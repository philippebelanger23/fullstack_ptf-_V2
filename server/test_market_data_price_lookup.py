"""Regression tests for the canonical market price lookup helper."""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from data_loader import merge_nav_sources
import market_data


class _FakeTicker:
    def __init__(self, history_frame: pd.DataFrame):
        self.history_frame = history_frame
        self.calls = []

    def history(self, start=None, end=None):
        self.calls.append((start, end))
        return self.history_frame


def test_get_price_on_date_uses_ticker_history_close_and_cache(monkeypatch):
    history_frame = pd.DataFrame(
        {"Close": [91.5, 92.01]},
        index=pd.to_datetime(["2026-03-30", "2026-03-31"]),
    )
    fake_ticker = _FakeTicker(history_frame)
    monkeypatch.setattr(market_data.yf, "Ticker", lambda _ticker: fake_ticker)

    cache = {}
    target_date = pd.Timestamp("2026-03-31")

    price_1 = market_data.get_price_on_date("SU.TO", target_date, cache)
    price_2 = market_data.get_price_on_date("SU.TO", target_date, cache)

    assert price_1 == 92.01
    assert price_2 == 92.01
    assert cache["history_close_v1::SU.TO_2026-03-31"] == 92.01
    assert len(fake_ticker.calls) == 1
    assert fake_ticker.calls[0][0] == pd.Timestamp("2026-03-21")
    assert fake_ticker.calls[0][1] == pd.Timestamp("2026-04-01")


def test_calculate_returns_does_not_fall_back_to_yahoo_for_nav_ticker(monkeypatch):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("Yahoo lookup should not be used for NAV tickers")

    monkeypatch.setattr(market_data, "get_price_on_date", _fail_if_called)

    weights_dict = {
        "BIP791": {
            pd.Timestamp("2024-12-31"): 1.0,
            pd.Timestamp("2025-01-31"): 1.0,
        }
    }
    nav_dict = {
        "BIP791": {
            pd.Timestamp("2025-01-31"): 10.0,
        }
    }

    returns, prices = market_data.calculate_returns(
        weights_dict,
        nav_dict,
        [pd.Timestamp("2024-12-31"), pd.Timestamp("2025-01-31")],
        cache={},
        mutual_fund_tickers=set(),
    )

    assert prices["BIP791"][pd.Timestamp("2024-12-31")] is None
    assert prices["BIP791"][pd.Timestamp("2025-01-31")] == 10.0
    assert returns["BIP791"][(pd.Timestamp("2024-12-31"), pd.Timestamp("2025-01-31"))] == 0.0


def test_merge_nav_sources_preserves_manual_dates_and_prefers_csv_on_conflict():
    manual_navs = {
        "DYN245": {
            pd.Timestamp("2025-12-17"): 31.1468,
            pd.Timestamp("2025-12-31"): 31.5615,
            pd.Timestamp("2026-01-30"): 99.0,
        }
    }
    csv_navs = {
        "DYN245": {
            pd.Timestamp("2026-01-02"): 27.8038,
            pd.Timestamp("2026-01-30"): 25.5191,
        }
    }

    merged = merge_nav_sources(manual_navs, csv_navs)

    assert pd.Timestamp("2025-12-17") in merged["DYN245"]
    assert merged["DYN245"][pd.Timestamp("2025-12-31")] == 31.5615
    assert merged["DYN245"][pd.Timestamp("2026-01-02")] == 27.8038
    assert merged["DYN245"][pd.Timestamp("2026-01-30")] == 25.5191


def test_get_nav_price_on_or_before_uses_exact_or_prior_only():
    nav_dict = {
        "DYN245": {
            pd.Timestamp("2025-12-17"): 31.1468,
            pd.Timestamp("2025-12-31"): 31.5615,
            pd.Timestamp("2026-01-02"): 27.8038,
            pd.Timestamp("2026-01-30"): 25.5191,
            pd.Timestamp("2026-02-27"): 24.2047,
            pd.Timestamp("2026-03-31"): 23.2303,
        }
    }

    assert market_data.get_nav_price_on_or_before("DYN245", pd.Timestamp("2025-12-31"), nav_dict) == 31.5615
    assert market_data.get_nav_price_on_or_before("DYN245", pd.Timestamp("2026-01-31"), nav_dict) == 25.5191
    assert market_data.get_nav_price_on_or_before("DYN245", pd.Timestamp("2026-02-28"), nav_dict) == 24.2047
    assert market_data.get_nav_price_on_or_before("DYN245", pd.Timestamp("2026-01-01"), nav_dict) == 31.5615


def test_get_nav_price_on_or_before_normalizes_raw_nav_keys():
    nav_dict = {
        "DYN245": {
            "2025-12-31T16:00:00": 31.5615,
            "2026-01-30T16:00:00": 25.5191,
        }
    }

    assert market_data.get_nav_price_on_or_before("DYN245", pd.Timestamp("2025-12-31"), nav_dict) == 31.5615
    assert market_data.get_nav_price_on_or_before("DYN245", pd.Timestamp("2026-01-31"), nav_dict) == 25.5191
