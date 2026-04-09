"""Regression tests for the canonical benchmark workspace service."""

import datetime as dt
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))

import services.benchmark_workspace_service as benchmark_workspace_service


def test_build_benchmark_workspace_returns_canonical_sections(monkeypatch):
    monkeypatch.setattr(
        benchmark_workspace_service,
        "_load_composition_slice",
        lambda existing_workspace, force_refresh=False: (
            {
                "sectors": [{"sector": "Technology", "ACWI": 20.0, "TSX": 4.0, "benchmarkWeight": 16.0}],
                "geography": [{"region": "United States", "weight": 45.0, "ACWI": 60.0, "TSX": 0.0}],
            },
            "fresh",
            None,
            "2026-04-07",
        ),
    )
    monkeypatch.setattr(
        benchmark_workspace_service,
        "_load_history_slice",
        lambda existing_workspace, force_refresh=False: (
            {
                "series": {
                    "ACWI": [{"date": "2026-04-07", "value": 150.0}],
                    "XIC.TO": [{"date": "2026-04-07", "value": 110.0}],
                    "75/25": [{"date": "2026-04-07", "value": 140.0}],
                }
            },
            "fresh",
            None,
            "2026-04-07",
        ),
    )
    monkeypatch.setattr(
        benchmark_workspace_service,
        "_load_currency_slice",
        lambda existing_workspace, geography: (
            {
                "rows": [
                    {
                        "code": "USD",
                        "weight": 45.0,
                        "ticker": "USDCAD=X",
                        "performance": {"YTD": 0.02},
                    }
                ]
            },
            "fresh",
            None,
        ),
    )
    monkeypatch.setattr(benchmark_workspace_service, "_now_iso", lambda: "2026-04-08T12:00:00Z")

    workspace = benchmark_workspace_service.build_benchmark_workspace()

    assert workspace["composition"]["sectors"][0]["benchmarkWeight"] == pytest.approx(16.0)
    assert workspace["performance"]["series"]["75/25"][0]["value"] == pytest.approx(140.0)
    assert workspace["currency"]["rows"][0]["ticker"] == "USDCAD=X"
    assert workspace["meta"] == {
        "builtAt": "2026-04-08T12:00:00Z",
        "exposureAsOf": "2026-04-07",
        "historyAsOf": "2026-04-07",
        "stale": False,
        "sourceStatus": {
            "composition": {"status": "fresh", "error": None},
            "performance": {"status": "fresh", "error": None},
            "currency": {"status": "fresh", "error": None},
        },
        "errors": {},
    }


def test_build_composition_payload_computes_benchmark_weights():
    composition, exposure_as_of = benchmark_workspace_service._build_composition_payload(
        {
            "ACWI": {
                "as_of_date": "2026-04-07",
                "Sectors": {
                    "Technology": 20.0,
                    "Health Care": 10.0,
                },
                "Geography": {
                    "United States": 60.0,
                    "Japan": 8.0,
                },
            },
            "TSX": {
                "Sectors": {
                    "Technology": 4.0,
                    "Financials": 30.0,
                },
                "Geography": {
                    "Canada": 100.0,
                },
            },
            "scraped_at": "2026-04-07T12:00:00Z",
        }
    )

    sectors = {row["sector"]: row for row in composition["sectors"]}
    geography = {row["region"]: row for row in composition["geography"]}

    assert exposure_as_of == "2026-04-07"
    assert sectors["Technology"]["benchmarkWeight"] == pytest.approx(16.0)
    assert sectors["Health Care"]["benchmarkWeight"] == pytest.approx(7.5)
    assert sectors["Financials"]["benchmarkWeight"] == pytest.approx(7.5)
    assert geography["United States"]["weight"] == pytest.approx(45.0)
    assert geography["Canada"]["weight"] == pytest.approx(25.0)
    assert geography["Japan"]["weight"] == pytest.approx(6.0)


def test_load_currency_slice_aligns_weights_with_fx_performance(monkeypatch):
    monkeypatch.setattr(benchmark_workspace_service, "load_cache", lambda: {})
    monkeypatch.setattr(benchmark_workspace_service, "save_cache", lambda cache: None)
    monkeypatch.setattr(
        benchmark_workspace_service,
        "get_ticker_performance",
        lambda tickers, cache: {
            "USDCAD=X": {"YTD": 0.01},
            "JPYCAD=X": {"YTD": -0.02},
            "EURCAD=X": {"YTD": 0.03},
        },
    )

    currency, status, error = benchmark_workspace_service._load_currency_slice(
        None,
        [
            {"region": "United States", "weight": 45.0},
            {"region": "Canada", "weight": 25.0},
            {"region": "Japan", "weight": 6.0},
            {"region": "France", "weight": 4.0},
            {"region": "Australia", "weight": 3.0},
            {"region": "Brazil", "weight": 2.0},
        ],
    )

    rows = {row["code"]: row for row in currency["rows"]}

    assert status == "fresh"
    assert error is None
    assert sum(row["weight"] for row in currency["rows"]) == pytest.approx(100.0)
    assert rows["USD"]["ticker"] == "USDCAD=X"
    assert rows["USD"]["performance"]["YTD"] == pytest.approx(0.01)
    assert rows["CAD"]["performance"] == {"YTD": 0.0, "3M": 0.0, "6M": 0.0, "1Y": 0.0}
    assert rows["JPY"]["ticker"] == "JPYCAD=X"
    assert rows["EUR"]["ticker"] == "EURCAD=X"
    assert rows["Other"]["ticker"] is None
    assert rows["Other"]["performance"] is None


def test_load_currency_slice_preserves_last_good_slice_on_refresh_failure(monkeypatch):
    monkeypatch.setattr(benchmark_workspace_service, "load_cache", lambda: {})
    monkeypatch.setattr(
        benchmark_workspace_service,
        "get_ticker_performance",
        lambda tickers, cache: (_ for _ in ()).throw(RuntimeError("fx lookup failed")),
    )

    existing_workspace = {
        "currency": {
            "rows": [
                {
                    "code": "USD",
                    "weight": 50.0,
                    "ticker": "USDCAD=X",
                    "performance": {"YTD": 0.05},
                }
            ]
        }
    }

    currency, status, error = benchmark_workspace_service._load_currency_slice(
        existing_workspace,
        [{"region": "United States", "weight": 45.0}],
    )

    assert status == "stale"
    assert error == "fx lookup failed"
    assert currency == existing_workspace["currency"]


def test_load_history_slice_preserves_cached_payload_when_refresh_fails(monkeypatch):
    cache_payload = {
        "ACWI": [{"date": "2026-04-07", "value": 150.0}],
        "XIC.TO": [{"date": "2026-04-07", "value": 110.0}],
        "Index": [{"date": "2026-04-07", "value": 140.0}],
    }

    monkeypatch.setattr(
        benchmark_workspace_service,
        "_read_json",
        lambda path: cache_payload if path == benchmark_workspace_service._history_cache_path() else None,
    )
    monkeypatch.setattr(
        benchmark_workspace_service,
        "_cache_age",
        lambda path: dt.timedelta(hours=2),
    )
    monkeypatch.setattr(
        benchmark_workspace_service,
        "_fetch_fresh_history_payload",
        lambda: (_ for _ in ()).throw(RuntimeError("history refresh failed")),
    )

    history, status, error, history_as_of = benchmark_workspace_service._load_history_slice(None, force_refresh=False)

    assert status == "stale"
    assert error == "history refresh failed"
    assert history_as_of == "2026-04-07"
    assert history["series"]["75/25"] == cache_payload["Index"]


def test_normalize_history_payload_drops_future_points(monkeypatch):
    monkeypatch.setattr(benchmark_workspace_service, "_today_iso_date", lambda: "2026-04-08")

    normalized = benchmark_workspace_service._normalize_history_payload(
        {
            "ACWI": [
                {"date": "2026-04-08", "value": 180.0},
                {"date": "2026-04-09", "value": 181.0},
            ],
            "XIC.TO": [
                {"date": "2026-04-07", "value": 120.0},
                {"date": "2026-04-10", "value": 121.0},
            ],
            "Index": [
                {"date": "2026-04-08", "value": 160.0},
                {"date": "2026-04-11", "value": 161.0},
            ],
        }
    )

    assert normalized["ACWI"] == [{"date": "2026-04-08", "value": 180.0}]
    assert normalized["XIC.TO"] == [{"date": "2026-04-07", "value": 120.0}]
    assert normalized["75/25"] == [{"date": "2026-04-08", "value": 160.0}]


def test_fetch_fresh_history_payload_uses_adjusted_close_for_xic(monkeypatch):
    captured: dict[str, object] = {}
    index = pd.to_datetime(["2026-04-07", "2026-04-08"])
    columns = pd.MultiIndex.from_product([["Close", "Adj Close"], ["ACWI", "XIC.TO", "USDCAD=X"]])
    frame = pd.DataFrame(
        [
            [100.0, 52.0, 1.25, 99.0, 53.02, 1.25],
            [101.0, 53.0, 1.26, 100.0, 53.68, 1.26],
        ],
        index=index,
        columns=columns,
    )

    def _fake_download(tickers, **kwargs):
        captured["tickers"] = tickers
        captured["kwargs"] = kwargs
        return frame

    monkeypatch.setattr(benchmark_workspace_service.yf, "download", _fake_download)

    payload = benchmark_workspace_service._fetch_fresh_history_payload()

    assert captured["tickers"] == ["ACWI", "XIC.TO", "USDCAD=X"]
    assert captured["kwargs"] == {
        "period": "5y",
        "interval": "1d",
        "progress": False,
        "auto_adjust": True,
    }
    assert payload["XIC.TO"] == [
        {"date": "2026-04-07", "value": pytest.approx(53.02)},
        {"date": "2026-04-08", "value": pytest.approx(53.68)},
    ]
