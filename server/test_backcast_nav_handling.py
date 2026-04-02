"""Regression tests for NAV-backed tickers in the backcast layer."""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

import services.backcast_service as backcast_service


def test_fetch_returns_df_includes_nav_tickers_without_yahoo_fetch(monkeypatch):
    captured = {}

    def fake_download(fetch_list, period=None, interval=None, progress=None):
        captured["fetch_list"] = list(fetch_list)
        idx = pd.to_datetime(["2026-03-30", "2026-03-31", "2026-04-01"])
        columns = pd.MultiIndex.from_tuples(
            [
                ("Close", "AAA"),
                ("Close", "USDCAD=X"),
            ]
        )
        return pd.DataFrame(
            [
                [100.0, 1.00],
                [101.0, 1.01],
                [102.0, 1.02],
            ],
            index=idx,
            columns=columns,
        )

    nav_dict = {
        "BIP791": {
            pd.Timestamp("2026-03-30"): 15.0,
            pd.Timestamp("2026-03-31"): 16.0,
            pd.Timestamp("2026-04-01"): 17.0,
        }
    }

    monkeypatch.setattr(backcast_service.yf, "download", fake_download)
    monkeypatch.setattr(backcast_service, "load_backcast_nav_data", lambda: nav_dict)
    monkeypatch.setattr(backcast_service, "BENCHMARK_BLEND_TICKERS", ["USDCAD=X"])

    returns_df, raw_returns_df, missing = backcast_service.fetch_returns_df(
        ["AAA", "BIP791"],
        mutual_fund_tickers=set(),
    )

    assert "BIP791" not in captured["fetch_list"]
    assert "BIP791" in returns_df.columns
    assert "BIP791" in raw_returns_df.columns
    assert missing == []
    assert abs(float(returns_df.loc[pd.Timestamp("2026-03-31"), "BIP791"]) - (16.0 / 15.0 - 1.0)) < 1e-12
