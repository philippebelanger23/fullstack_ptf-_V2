"""Regression tests for the canonical portfolio workspace service."""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).parent))

import services.performance_service as performance_service
import services.workspace_service as workspace_service
from services.period_normalizer import normalize_portfolio_periods as normalize_periods_impl


def _item(
    ticker: str,
    weight: float,
    date: str,
    *,
    is_mutual_fund: bool = False,
    is_etf: bool = False,
    is_cash: bool = False,
):
    return type(
        "Item",
        (),
        {
            "ticker": ticker,
            "weight": weight,
            "date": date,
            "isMutualFund": is_mutual_fund,
            "isEtf": is_etf,
            "isCash": is_cash,
        },
    )()


def test_build_portfolio_workspace_normalizes_duplicate_rows_and_latest_snapshot(monkeypatch):
    monkeypatch.setattr(
        workspace_service,
        "normalize_portfolio_periods",
        lambda weights, dates: normalize_periods_impl(weights, dates, now=pd.Timestamp("2026-04-03")),
    )
    monkeypatch.setattr(workspace_service, "load_workspace_nav_data", lambda: {})
    monkeypatch.setattr(workspace_service, "load_cache", lambda: {})
    monkeypatch.setattr(workspace_service, "save_cache", lambda cache: None)
    monkeypatch.setattr(workspace_service, "_prime_price_cache_for_dates", lambda *args, **kwargs: None)
    monkeypatch.setattr(workspace_service, "_build_benchmark_lists", lambda *args, **kwargs: ({}, {}))
    monkeypatch.setattr(
        workspace_service,
        "_build_performance_section",
        lambda *args, **kwargs: {"defaultBenchmark": "75/25", "variants": {}},
    )
    monkeypatch.setattr(
        workspace_service,
        "_build_risk_section",
        lambda *args, **kwargs: {"portfolioBeta": 1.0, "positions": [], "sectorRisk": [], "missingTickers": []},
    )
    monkeypatch.setattr(workspace_service, "_build_nav_audit", lambda: {})
    monkeypatch.setattr(workspace_service, "_build_mf_traces", lambda *args, **kwargs: {})
    monkeypatch.setattr(workspace_service, "get_company_name_map", lambda *args, **kwargs: {"AAA": "Alpha"})

    prices = {
        ("AAA", "2026-03-31"): 100.0,
        ("AAA", "2026-04-02"): 110.0,
        ("AAA", "2026-04-03"): 115.0,
    }

    monkeypatch.setattr(
        workspace_service,
        "get_price_on_date",
        lambda ticker, date, cache: prices.get((ticker, pd.Timestamp(date).strftime("%Y-%m-%d"))),
    )

    items = [
        _item("AAA", 10.0, "2026-03-31"),
        _item("AAA", 12.0, "2026-03-31"),
        _item("AAA", 8.0, "2026-04-02"),
        _item("*CASH*", 5.0, "2026-03-31", is_cash=True),
        _item("*CASH*", 5.0, "2026-04-02", is_cash=True),
    ]

    workspace = workspace_service.build_portfolio_workspace(items)

    assert workspace["input"]["latestHoldingsDate"] == "2026-04-03"
    assert workspace["timeline"]["expandedDates"] == ["2026-03-31", "2026-04-02", "2026-04-03"]

    period_items = workspace["holdings"]["periodItems"]
    assert len(period_items) == 4
    assert period_items[0]["periodIndex"] == 0
    assert period_items[0]["periodStart"] == "2026-03-31"
    assert period_items[0]["periodEnd"] == "2026-04-02"
    assert period_items[0]["periodKey"] == "2026-03-31|2026-04-02"
    assert period_items[0]["priceCovered"] is True

    holdings = {(item["ticker"], item["date"]): item for item in workspace["holdings"]["items"]}
    assert holdings[("AAA", "2026-04-02")]["weight"] == 12.0
    assert holdings[("AAA", "2026-04-02")]["companyName"] == "Alpha"
    assert holdings[("AAA", "2026-04-03")]["weight"] == 8.0
    assert holdings[("*CASH*", "2026-04-03")]["isCash"] is True

    overview_layout = workspace["attribution"]["overviewLayouts"]["2026"]["Q2"]
    assert overview_layout["waterfall"]["bars"][-1]["name"] == "Total"
    assert isinstance(overview_layout["sectorAttribution"]["ALL"]["SECTOR"]["data"], list)

    latest_holdings = {(item["ticker"], item["date"]) for item in workspace["holdings"]["latestItems"]}
    assert latest_holdings == {("AAA", "2026-04-03"), ("*CASH*", "2026-04-03")}


def test_build_performance_section_emits_all_benchmark_variants(monkeypatch):
    index = pd.to_datetime(["2026-03-31", "2026-04-01", "2026-04-02"])
    returns_df = pd.DataFrame(
        {
            "AAA": [0.0, 0.01, 0.02],
            "ACWI": [0.0, 0.01, 0.01],
            "XIC.TO": [0.0, 0.005, 0.005],
            "XUS.TO": [0.0, 0.008, 0.009],
            "USDCAD=X": [0.0, 0.001, 0.001],
        },
        index=index,
    )

    monkeypatch.setattr(workspace_service, "fetch_returns_df", lambda *args, **kwargs: (returns_df, returns_df, []))
    monkeypatch.setattr(
        workspace_service,
        "build_period_weighted_portfolio_returns",
        lambda returns_df, period_weights: (pd.Series([0.0, 0.01, 0.02], index=returns_df.index), []),
    )
    monkeypatch.setattr(
        workspace_service,
        "build_benchmark_returns",
        lambda returns_df, benchmark="75/25": pd.Series([0.0, 0.005, 0.006], index=returns_df.index),
    )
    monkeypatch.setattr(
        workspace_service,
        "compute_performance_metrics",
        lambda portfolio_returns, benchmark_returns: {
            "metrics": {"totalReturn": 1.0},
            "series": [{"date": "2026-04-02", "portfolio": 101.0, "benchmark": 100.6}],
            "topDrawdowns": [],
        },
    )
    monkeypatch.setattr(
        performance_service,
        "compute_period_attribution",
        lambda returns_df, period_weights, nav_tickers=None: [{"ticker": "AAA", "date": "2026-04-02", "weight": 10.0, "returnPct": 0.03, "contribution": 0.3}],
    )

    holdings_items = [
        {"ticker": "AAA", "weight": 10.0, "date": "2026-03-31", "isCash": False},
        {"ticker": "AAA", "weight": 10.0, "date": "2026-04-02", "isCash": False},
    ]

    performance = workspace_service._build_performance_section(holdings_items, set(), {})

    assert performance["defaultBenchmark"] == "75/25"
    assert set(performance["variants"].keys()) == {"75/25", "TSX", "SP500", "ACWI"}
    assert performance["variants"]["75/25"]["periodAttribution"][0]["ticker"] == "AAA"
    assert "periodAttribution" not in performance["variants"]["TSX"]


def test_build_portfolio_workspace_emits_canonical_monthly_return_maps(monkeypatch):
    monkeypatch.setattr(workspace_service, "normalize_portfolio_periods", lambda weights, dates: (weights, dates))
    monkeypatch.setattr(workspace_service, "load_workspace_nav_data", lambda: {})
    monkeypatch.setattr(workspace_service, "load_cache", lambda: {})
    monkeypatch.setattr(workspace_service, "save_cache", lambda cache: None)
    monkeypatch.setattr(workspace_service, "_build_benchmark_lists", lambda *args, **kwargs: ({}, {}))
    monkeypatch.setattr(
        workspace_service,
        "_build_performance_section",
        lambda *args, **kwargs: {
            "defaultBenchmark": "75/25",
            "variants": {
                "75/25": {
                    "series": [
                        {"date": "2025-12-31", "portfolio": 100.0, "benchmark": 100.0},
                        {"date": "2026-01-31", "portfolio": 110.0, "benchmark": 100.0},
                    ],
                    "periodAttribution": [],
                    "fetchedAt": "2026-01-31T00:00:00Z",
                }
            },
        },
    )
    monkeypatch.setattr(
        workspace_service,
        "_build_risk_section",
        lambda *args, **kwargs: {"portfolioBeta": 1.0, "positions": [], "sectorRisk": [], "missingTickers": []},
    )
    monkeypatch.setattr(workspace_service, "_build_nav_audit", lambda: {})
    monkeypatch.setattr(workspace_service, "_build_mf_traces", lambda *args, **kwargs: {})
    monkeypatch.setattr(workspace_service, "get_company_name_map", lambda *args, **kwargs: {"AAA": "Alpha"})

    prices = {
        ("AAA", "2025-12-31"): 100.0,
        ("AAA", "2026-01-31"): 110.0,
    }
    monkeypatch.setattr(
        workspace_service,
        "get_price_on_date",
        lambda ticker, date, cache: prices.get((ticker, pd.Timestamp(date).strftime("%Y-%m-%d"))),
    )

    workspace = workspace_service.build_portfolio_workspace([
        _item("AAA", 100.0, "2025-12-31"),
        _item("AAA", 100.0, "2026-01-31"),
    ])

    monthly_period = workspace["attribution"]["monthlyPeriods"][0]
    monthly_key = f"{monthly_period['start']}|{monthly_period['end']}"

    assert workspace["attribution"]["portfolioMonthlyReturns"] == {monthly_key: pytest.approx(0.1)}
    assert workspace["attribution"]["portfolioYtdReturn"] == pytest.approx(0.1)


def test_prime_price_cache_respects_market_data_lookback_window(monkeypatch):
    closes = pd.DataFrame(
        {"SU.TO": [69.83000183105469]},
        index=pd.to_datetime(["2026-01-21"]),
    )

    monkeypatch.setattr(workspace_service, "load_local_close_frame", lambda tickers: closes)

    cache = {}
    boundary_dates = pd.to_datetime(["2026-01-21", "2026-01-31", "2026-02-26", "2026-03-31"]).tolist()

    workspace_service._prime_price_cache_for_dates(["SU.TO"], boundary_dates, cache)

    assert cache[workspace_service.build_history_close_cache_key("SU.TO", pd.Timestamp("2026-01-21"))] == pytest.approx(69.83000183105469)
    assert cache[workspace_service.build_history_close_cache_key("SU.TO", pd.Timestamp("2026-01-31"))] == pytest.approx(69.83000183105469)
    assert workspace_service.build_history_close_cache_key("SU.TO", pd.Timestamp("2026-02-26")) not in cache
    assert workspace_service.build_history_close_cache_key("SU.TO", pd.Timestamp("2026-03-31")) not in cache


def test_waterfall_layout_uses_top_ten_by_weight():
    summary_rows = [
        {"ticker": "HIGHWT", "weight": 20.0, "latestWeight": 20.0, "contribution": 0.001, "returnPct": 0.01, "isCash": False},
        {"ticker": "BIGCONTRIB", "weight": 50.0, "latestWeight": 0.5, "contribution": 0.05, "returnPct": 0.20, "isCash": False},
        {"ticker": "MIDWT", "weight": 10.0, "latestWeight": 10.0, "contribution": -0.002, "returnPct": -0.01, "isCash": False},
    ] + [
        {"ticker": f"T{i}", "weight": 9.0 - i, "latestWeight": 9.0 - i, "contribution": 0.0001 * i, "returnPct": 0.01, "isCash": False}
        for i in range(1, 10)
    ]

    waterfall = workspace_service._build_waterfall_layout(summary_rows, portfolio_return=1.23)

    bars = waterfall["bars"]
    names = [bar["name"] for bar in bars]
    assert names[:3] == ["HIGHWT", "MIDWT", "T1"]
    assert "BIGCONTRIB" not in names[:10]
    assert names[-2:] == ["Others", "Total"]

    total_bar = bars[-1]
    others_bar = next(bar for bar in bars if bar["name"] == "Others")
    top_sum = sum(bar["delta"] for bar in bars if not bar["isTotal"] and bar["name"] != "Others")
    assert abs((top_sum + others_bar["delta"]) - total_bar["delta"]) < 1e-9


def test_waterfall_layout_excludes_non_current_holdings():
    summary_rows = [
        {"ticker": "CURRENT", "weight": 5.0, "latestWeight": 5.0, "contribution": 0.01, "returnPct": 0.05, "isCash": False},
        {"ticker": "OLDWINNER", "weight": 50.0, "latestWeight": 0.0, "contribution": 0.25, "returnPct": 0.50, "isCash": False},
    ]

    waterfall = workspace_service._build_waterfall_layout(summary_rows, portfolio_return=0.75)

    names = [bar["name"] for bar in waterfall["bars"]]
    assert names == ["CURRENT", "Others", "Total"]


def test_build_risk_section_aligns_portfolio_and_benchmark_series(monkeypatch):
    index = pd.to_datetime(["2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03"])
    returns_df = pd.DataFrame(
        {
            "AAA": [0.0, 0.01, 0.02, -0.01],
            "ACWI": [0.0, 0.005, 0.004, -0.002],
            "XIC.TO": [0.0, 0.003, 0.002, -0.001],
            "USDCAD=X": [0.0, 0.001, 0.001, 0.0],
        },
        index=index,
    )

    captured = {}

    monkeypatch.setattr(workspace_service, "fetch_returns_df", lambda *args, **kwargs: (returns_df, returns_df, []))
    monkeypatch.setattr(
        workspace_service,
        "build_benchmark_returns",
        lambda returns_df, benchmark="75/25": pd.Series([0.0, 0.004, 0.003, -0.001], index=returns_df.index),
    )
    monkeypatch.setattr(workspace_service, "compute_annualized_vol", lambda values: float(len(values)))

    def fake_compute_beta(ptf_rets, bmk_rets):
        captured["portfolio_len"] = len(ptf_rets)
        captured["benchmark_len"] = len(bmk_rets)
        return 1.23

    monkeypatch.setattr(workspace_service, "compute_beta", fake_compute_beta)

    latest_items = [
        {"ticker": "AAA", "weight": 100.0, "date": "2026-04-03", "isCash": False, "isMutualFund": False, "isEtf": False},
    ]

    historical_items = [
        {"ticker": "AAA", "weight": 100.0, "date": "2026-03-31", "isCash": False},
        {"ticker": "AAA", "weight": 100.0, "date": "2026-04-03", "isCash": False},
    ]

    risk = workspace_service._build_risk_section(latest_items, historical_items, set(), {})

    assert captured["portfolio_len"] == 3
    assert captured["benchmark_len"] == 3
    assert risk["portfolioBeta"] == 1.23
    assert risk["correlationMatrix"]["tickers"] == ["AAA"]
    assert risk["correlationMatrix"]["matrix"] == [[1.0]]


def test_build_risk_section_orders_correlation_by_latest_weights(monkeypatch):
    index = pd.to_datetime(["2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03"])
    returns_df = pd.DataFrame(
        {
            "LOW": [0.0, 0.01, 0.02, -0.01],
            "HIGH": [0.0, 0.02, 0.01, -0.02],
            "ACWI": [0.0, 0.005, 0.004, -0.002],
            "XIC.TO": [0.0, 0.003, 0.002, -0.001],
            "USDCAD=X": [0.0, 0.001, 0.001, 0.0],
        },
        index=index,
    )

    monkeypatch.setattr(workspace_service, "fetch_returns_df", lambda *args, **kwargs: (returns_df, returns_df, []))
    monkeypatch.setattr(
        workspace_service,
        "build_benchmark_returns",
        lambda returns_df, benchmark="75/25": pd.Series([0.0, 0.004, 0.003, -0.001], index=returns_df.index),
    )
    monkeypatch.setattr(workspace_service, "compute_annualized_vol", lambda values: float(len(values)))
    monkeypatch.setattr(workspace_service, "compute_beta", lambda ptf_rets, bmk_rets: 1.0)
    monkeypatch.setattr(workspace_service, "resolve_storage_path", lambda path: type("P", (), {"exists": lambda self: False})())

    latest_items = [
        {"ticker": "LOW", "weight": 1.0, "date": "2026-04-03", "isCash": False, "isMutualFund": False, "isEtf": False},
        {"ticker": "HIGH", "weight": 5.0, "date": "2026-04-03", "isCash": False, "isMutualFund": False, "isEtf": False},
    ]
    historical_items = [
        {"ticker": "HIGH", "weight": 1.0, "date": "2026-04-01", "isCash": False},
        {"ticker": "LOW", "weight": 9.0, "date": "2026-04-02", "isCash": False},
    ]

    risk = workspace_service._build_risk_section(latest_items, historical_items, set(), {})

    assert risk["correlationMatrix"]["tickers"] == ["HIGH", "LOW"]
    assert len(risk["correlationMatrix"]["matrix"]) == 2
