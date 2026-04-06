import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from models import PortfolioItem  # noqa: E402
from services.workspace_service import build_portfolio_workspace  # noqa: E402


CLIENT_YEAR_AUDIT_FINDINGS = [
    {
        "path": "client/App.tsx",
        "issue": "selectedYear state is hard typed as 2025 | 2026 and defaults to 2026.",
    },
    {
        "path": "client/views/UploadView.tsx",
        "issue": "NAV audit filters branch as selectedYear === 2025 else 2026 using hardcoded boundary dates.",
    },
    {
        "path": "client/components/manual-entry/ManualEntryModal.tsx",
        "issue": "Manual entry year selector only exposes 2025 and 2026.",
    },
    {
        "path": "client/components/manual-entry/useManualEntryState.ts",
        "issue": "Manual-entry period filtering branches as 2025 else 2026 instead of deriving years from data.",
    },
    {
        "path": "client/views/performance/PerformanceKPIs.tsx",
        "issue": "Performance period type includes literal '2025' instead of a year-generic full-year mode.",
    },
    {
        "path": "client/views/performance/PerformanceCharts.tsx",
        "issue": "Performance period buttons expose literal '2025' only.",
    },
    {
        "path": "client/views/ReportView.tsx",
        "issue": "One-pager/report period labels and selectors still expose 'Full Year 2025'.",
    },
    {
        "path": "client/utils/dateUtils.ts",
        "issue": "Date-range helper has a literal case for '2025' with fixed 2024-12-31 -> 2025-12-31 bounds.",
    },
    {
        "path": "client/components/IndexPerformanceChart.tsx",
        "issue": "Index chart period model includes a literal 2025 mode.",
    },
]

SERVER_YEAR_AUDIT_FINDINGS = [
    {
        "path": "server/services/period_normalizer.py",
        "issue": "Canonical period normalization is year-agnostic and extends periods based on input dates and current day.",
    },
    {
        "path": "server/services/workspace_service.py",
        "issue": "Canonical monthly and period builders group by actual period end dates, not hardcoded years.",
    },
]


def load_config() -> dict[str, Any]:
    return json.loads((ROOT / "server" / "data" / "portfolio_config.json").read_text())


def load_items() -> list[PortfolioItem]:
    cfg = load_config()
    items: list[PortfolioItem] = []
    for period in cfg.get("periods", []):
        for ticker in cfg.get("tickers", []):
            raw_weight = period.get("weights", {}).get(ticker["ticker"], "0")
            if isinstance(raw_weight, str):
                weight = float(raw_weight.replace("%", "").strip() or 0.0)
            else:
                weight = float(raw_weight)
            items.append(
                PortfolioItem(
                    ticker=ticker["ticker"],
                    weight=weight,
                    date=period["startDate"],
                    isMutualFund=ticker.get("isMutualFund", False),
                    isEtf=ticker.get("isEtf", False),
                    isCash=ticker.get("isCash", False),
                )
            )
    return items


def year_counter(values: list[str | None]) -> dict[str, int]:
    return dict(sorted(Counter(value[:4] for value in values if value).items()))


def _build_price_indexes(holding_rows: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, float | None], dict[str, float | None]]:
    by_period_key = {
        str(row.get("periodKey")): row
        for row in holding_rows
        if row.get("periodKey")
    }
    start_prices = {
        str(row.get("periodStart")): row.get("startPrice")
        for row in holding_rows
        if row.get("periodStart") is not None
    }
    end_prices = {
        str(row.get("periodEnd")): row.get("endPrice")
        for row in holding_rows
        if row.get("periodEnd") is not None
    }
    return by_period_key, start_prices, end_prices


def _resolve_prices_for_span(
    by_period_key: dict[str, dict[str, Any]],
    start_prices: dict[str, float | None],
    end_prices: dict[str, float | None],
    start_date: str,
    end_date: str,
) -> tuple[float | None, float | None]:
    exact = by_period_key.get(f"{start_date}|{end_date}")
    if exact is not None:
        return exact.get("startPrice"), exact.get("endPrice")
    return start_prices.get(start_date), end_prices.get(end_date)


def write_rows(ticker: str, workspace: dict[str, Any]) -> Path:
    attr = workspace["attribution"]

    monthly_row = next((row for row in attr["monthlySheet"] if row["ticker"] == ticker), None)
    period_row = next((row for row in attr["periodSheet"] if row["ticker"] == ticker), None)
    period_holding_rows = [
        row
        for row in workspace["holdings"].get("periodItems", workspace["holdings"]["items"])
        if row["ticker"] == ticker
    ]
    holding_rows = period_holding_rows
    by_period_key, start_prices, end_prices = _build_price_indexes(holding_rows)

    output_dir = ROOT / "docs" / "debug"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{ticker.lower().replace('.', '_')}-canonical-table.csv"

    fieldnames = [
        "source",
        "sequence",
        "label",
        "start_date",
        "end_date",
        "display_date",
        "weight_pct",
        "return_pct",
        "contribution_pct",
        "start_price",
        "end_price",
    ]

    rows: list[dict[str, object]] = []

    if monthly_row:
        for idx, period in enumerate(attr["monthlyPeriods"]):
            detail = monthly_row["months"][idx]
            start_price, end_price = _resolve_prices_for_span(
                by_period_key,
                start_prices,
                end_prices,
                period["start"],
                period["end"],
            )
            rows.append(
                {
                    "source": "monthly_sheet",
                    "sequence": idx + 1,
                    "label": f"{period['start']} -> {period['end']}",
                    "start_date": period["start"],
                    "end_date": period["end"],
                    "display_date": period["end"],
                    "weight_pct": next((row.get("weight") for row in holding_rows if row.get("periodEnd") == period["end"]), ""),
                    "return_pct": detail["returnPct"] * 100,
                    "contribution_pct": detail["contribution"],
                    "start_price": start_price if start_price is not None else "",
                    "end_price": end_price if end_price is not None else "",
                }
            )
        ytd_start = attr["monthlyPeriods"][0]["start"] if attr.get("monthlyPeriods") else ""
        ytd_end = attr["monthlyPeriods"][-1]["end"] if attr.get("monthlyPeriods") else ""
        ytd_start_price, ytd_end_price = _resolve_prices_for_span(
            by_period_key,
            start_prices,
            end_prices,
            ytd_start,
            ytd_end,
        ) if ytd_start and ytd_end else (None, None)
        rows.append(
            {
                "source": "monthly_ytd",
                "sequence": "",
                "label": "YTD",
                "start_date": ytd_start,
                "end_date": ytd_end,
                "display_date": "",
                "weight_pct": "",
                "return_pct": monthly_row["ytdReturn"] * 100,
                "contribution_pct": monthly_row["ytdContrib"],
                "start_price": ytd_start_price if ytd_start_price is not None else "",
                "end_price": ytd_end_price if ytd_end_price is not None else "",
            }
        )

    if period_row:
        for idx, period in enumerate(attr["periods"]):
            detail = period_row["periods"][idx]
            start_price, end_price = _resolve_prices_for_span(
                by_period_key,
                start_prices,
                end_prices,
                period["start"],
                period["end"],
            )
            rows.append(
                {
                    "source": "period_sheet",
                    "sequence": idx + 1,
                    "label": f"{period['start']} -> {period['end']}",
                    "start_date": period["start"],
                    "end_date": period["end"],
                    "display_date": period["end"],
                    "weight_pct": detail["weight"],
                    "return_pct": detail["returnPct"] * 100,
                    "contribution_pct": detail["contribution"],
                    "start_price": start_price if start_price is not None else "",
                    "end_price": end_price if end_price is not None else "",
                }
            )
        ytd_start = attr["periods"][0]["start"] if attr.get("periods") else ""
        ytd_end = attr["periods"][-1]["end"] if attr.get("periods") else ""
        ytd_start_price, ytd_end_price = _resolve_prices_for_span(
            by_period_key,
            start_prices,
            end_prices,
            ytd_start,
            ytd_end,
        ) if ytd_start and ytd_end else (None, None)
        rows.append(
            {
                "source": "period_ytd",
                "sequence": "",
                "label": "YTD",
                "start_date": ytd_start,
                "end_date": ytd_end,
                "display_date": "",
                "weight_pct": "",
                "return_pct": period_row["ytdReturn"] * 100,
                "contribution_pct": period_row["ytdContrib"],
                "start_price": ytd_start_price if ytd_start_price is not None else "",
                "end_price": ytd_end_price if ytd_end_price is not None else "",
            }
        )

    for idx, row in enumerate(holding_rows, start=1):
        rows.append(
            {
                "source": "holding_items",
                "sequence": idx,
                "label": row["date"],
                "start_date": row.get("periodStart") or "",
                "end_date": row.get("periodEnd") or "",
                "display_date": row["date"],
                "weight_pct": row.get("weight"),
                "return_pct": row.get("returnPct", 0) * 100,
                "contribution_pct": row.get("contribution"),
                "start_price": row.get("startPrice"),
                "end_price": row.get("endPrice"),
            }
        )

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return output_path


def write_year_audit(ticker: str, workspace: dict[str, Any], config: dict[str, Any]) -> Path:
    attr = workspace["attribution"]
    holdings_items = workspace["holdings"]["items"]
    ticker_holdings = [row for row in holdings_items if row["ticker"] == ticker]

    config_periods = config.get("periods", [])
    config_start_dates = [period.get("startDate") for period in config_periods]
    attr_period_end_dates = [period.get("end") for period in attr.get("periods", [])]
    attr_monthly_end_dates = [period.get("end") for period in attr.get("monthlyPeriods", [])]
    holding_dates = [row.get("date") for row in holdings_items]
    ticker_dates = [row.get("date") for row in ticker_holdings]

    years_present = sorted(
        {
            year
            for year in (
                set(year_counter(config_start_dates))
                | set(year_counter(attr_period_end_dates))
                | set(year_counter(attr_monthly_end_dates))
                | set(year_counter(holding_dates))
            )
            if year
        }
    )

    year_audit = {
        "summary": {
            "hypothesis": "Canonical workspace builder appears year-agnostic; remaining failures are more likely caused by client-side hardcoded year handling than by workspace_service period construction.",
            "focus_years": years_present,
            "ticker": ticker,
            "latest_holdings_date": workspace["input"].get("latestHoldingsDate"),
        },
        "coverage": {
            "config_period_years": year_counter(config_start_dates),
            "attribution_period_years": year_counter(attr_period_end_dates),
            "attribution_monthly_years": year_counter(attr_monthly_end_dates),
            "holding_item_years": year_counter(holding_dates),
            "ticker_holding_years": year_counter(ticker_dates),
        },
        "samples": {
            "config_last_start_dates": config_start_dates[-8:],
            "attribution_last_periods": attr.get("periods", [])[-8:],
            "attribution_last_monthly_periods": attr.get("monthlyPeriods", [])[-8:],
            "ticker_last_holdings": ticker_holdings[-8:],
        },
        "workspace_checks": {
            "has_2025_periods": any((date or "").startswith("2025") for date in attr_period_end_dates),
            "has_2026_periods": any((date or "").startswith("2026") for date in attr_period_end_dates),
            "has_2025_months": any((date or "").startswith("2025") for date in attr_monthly_end_dates),
            "has_2026_months": any((date or "").startswith("2026") for date in attr_monthly_end_dates),
            "portfolio_ytd_return": attr.get("portfolioYtdReturn"),
        },
        "findings": {
            "client": CLIENT_YEAR_AUDIT_FINDINGS,
            "server": SERVER_YEAR_AUDIT_FINDINGS,
        },
    }

    output_dir = ROOT / "docs" / "debug"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{ticker.lower().replace('.', '_')}-year-audit.json"
    output_path.write_text(json.dumps(year_audit, indent=2), encoding="utf-8")
    return output_path


def main() -> int:
    ticker = (sys.argv[1] if len(sys.argv) > 1 else "SU.TO").upper()
    config = load_config()
    workspace = build_portfolio_workspace(load_items())

    csv_path = write_rows(ticker, workspace)
    audit_path = write_year_audit(ticker, workspace, config)

    print(csv_path)
    print(audit_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
