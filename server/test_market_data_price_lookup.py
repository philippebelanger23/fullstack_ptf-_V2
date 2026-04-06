"""Regression tests for the canonical market price lookup helper."""

import sys
import shutil
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))

from data_loader import merge_nav_sources
import market_data


class _FakeTicker:
    def __init__(self, history_frame: pd.DataFrame):
        self.history_frame = history_frame
        self.calls = []

    def history(self, start=None, end=None, **kwargs):
        self.calls.append((start, end, kwargs))
        return self.history_frame


def test_get_price_on_date_uses_ticker_history_adjusted_close_and_cache(monkeypatch):
    history_frame = pd.DataFrame(
        {"Adj Close": [91.5, 92.01], "Close": [93.0, 94.0]},
        index=pd.to_datetime(["2026-03-30", "2026-03-31"]),
    )
    fake_ticker = _FakeTicker(history_frame)
    monkeypatch.setattr(market_data.yf, "Ticker", lambda _ticker: fake_ticker)
    monkeypatch.setattr(market_data, "get_local_price_on_or_before", lambda *args, **kwargs: None)

    cache = {}
    target_date = pd.Timestamp("2026-03-31")

    price_1 = market_data.get_price_on_date("SU.TO", target_date, cache)
    price_2 = market_data.get_price_on_date("SU.TO", target_date, cache)

    assert price_1 == 92.01
    assert price_2 == 92.01
    assert cache[market_data.build_history_close_cache_key("SU.TO", target_date)] == 92.01
    assert len(fake_ticker.calls) == 1
    assert fake_ticker.calls[0][0] == pd.Timestamp("2026-03-21")
    assert fake_ticker.calls[0][1] == pd.Timestamp("2026-04-01")
    assert fake_ticker.calls[0][2]["timeout"] == 5
    assert fake_ticker.calls[0][2]["auto_adjust"] is True


def test_extract_download_price_frame_prefers_adjusted_close_over_close():
    frame = pd.DataFrame(
        {
            "Close": [93.0, 94.0],
            "Adj Close": [91.5, 92.01],
        },
        index=pd.to_datetime(["2026-03-30", "2026-03-31"]),
    )

    extracted = market_data.extract_download_price_frame(frame, ["SU.TO"])

    assert list(extracted.iloc[:, 0]) == [91.5, 92.01]


def test_get_price_on_date_uses_local_price_history_before_yahoo(monkeypatch):
    market_data.load_local_price_history.cache_clear()

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("Yahoo lookup should not be used when local price history exists")

    monkeypatch.setattr(market_data.yf, "Ticker", _fail_if_called)

    cache = {}
    price = market_data.get_price_on_date("SU.TO", pd.Timestamp("2026-01-21"), cache)

    assert price == pytest.approx(69.2936019897461)
    assert cache[market_data.build_history_close_cache_key("SU.TO", pd.Timestamp("2026-01-21"))] == pytest.approx(69.2936019897461)


def test_load_local_price_history_prefers_adjusted_close_when_both_columns_exist(monkeypatch):
    market_data.load_local_price_history.cache_clear()

    tmp_root = Path(__file__).parent / "_tmp_adjusted_close_case"
    csv_dir = tmp_root / "data" / "price_history"
    try:
        csv_dir.mkdir(parents=True, exist_ok=True)
        csv_path = csv_dir / "SU_TO.csv"
        csv_path.write_text(
            "Date,Close,Adj_Close\n"
            "2026-03-30,93.0,91.5\n"
            "2026-03-31,94.0,92.01\n",
            encoding="utf-8",
        )

        monkeypatch.setattr(market_data, "resolve_storage_path", lambda relative_path: tmp_root / relative_path)

        series = market_data.load_local_price_history("SU.TO")

        assert list(series.values) == [91.5, 92.01]
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


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
