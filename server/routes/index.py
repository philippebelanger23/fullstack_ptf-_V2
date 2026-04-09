"""Index and benchmark workspace routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter

from services.benchmark_workspace_service import (
    BENCHMARK_SERIES_KEY,
    get_benchmark_workspace,
    refresh_benchmark_workspace,
)
from services.sector_history_service import load_sector_history_cache

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/benchmark-workspace")
def benchmark_workspace():
    return get_benchmark_workspace()


@router.post("/index-refresh")
def refresh_index_data():
    workspace = refresh_benchmark_workspace(force_refresh=True)
    return {
        "status": "ok",
        "builtAt": workspace.get("meta", {}).get("builtAt"),
        "stale": workspace.get("meta", {}).get("stale"),
        "errors": workspace.get("meta", {}).get("errors", {}),
    }


@router.get("/index-exposure")
def get_index_exposure():
    workspace = get_benchmark_workspace()
    sectors = [
        {
            "sector": row.get("sector"),
            "ACWI": row.get("ACWI"),
            "TSX": row.get("TSX"),
            "Index": row.get("benchmarkWeight"),
        }
        for row in workspace.get("composition", {}).get("sectors", [])
    ]
    return {
        "sectors": sectors,
        "geography": workspace.get("composition", {}).get("geography", []),
        "last_scraped": workspace.get("meta", {}).get("exposureAsOf"),
    }


@router.get("/index-history")
def get_index_history():
    workspace = get_benchmark_workspace()
    series = workspace.get("performance", {}).get("series", {})
    return {
        "ACWI": series.get("ACWI", []),
        "XIC.TO": series.get("XIC.TO", []),
        BENCHMARK_SERIES_KEY: series.get(BENCHMARK_SERIES_KEY, []),
        "Index": series.get(BENCHMARK_SERIES_KEY, []),
    }


@router.get("/sector-history")
def get_sector_history():
    return load_sector_history_cache()
