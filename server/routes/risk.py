"""Legacy risk/performance routes backed by the canonical workspace."""

from __future__ import annotations

import logging
from copy import deepcopy

from fastapi import APIRouter

from models import BackcastRequest
from services.workspace_service import build_portfolio_workspace

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_workspace_payload(items):
    if not items:
        return None, {"error": "No portfolio items provided"}

    try:
        return build_portfolio_workspace(items), None
    except ValueError as exc:
        return None, {"error": str(exc)}
    except Exception as exc:  # pragma: no cover - operational guard
        logger.exception("Canonical workspace build failed for legacy risk route")
        return None, {"error": str(exc)}


@router.post("/portfolio-backcast")
async def portfolio_backcast(request: BackcastRequest):
    workspace, error = _build_workspace_payload(request.items)
    if error:
        return error

    variants = workspace.get("performance", {}).get("variants", {})
    default_benchmark = workspace.get("performance", {}).get("defaultBenchmark", "75/25")
    benchmark = request.benchmark if request.benchmark in variants else default_benchmark
    variant = deepcopy(variants.get(benchmark))

    if not variant:
        return {"error": f"No performance variant available for benchmark '{request.benchmark}'"}

    if not request.includeAttribution:
        variant.pop("periodAttribution", None)

    return variant


@router.post("/risk-contribution")
async def risk_contribution(request: BackcastRequest):
    workspace, error = _build_workspace_payload(request.items)
    if error:
        return error
    return deepcopy(workspace.get("risk", {}))


@router.post("/rolling-metrics")
async def rolling_metrics_endpoint(request: BackcastRequest):
    workspace, error = _build_workspace_payload(request.items)
    if error:
        return error

    rolling_metrics = workspace.get("performance", {}).get("rollingMetrics", {})
    default_benchmark = workspace.get("performance", {}).get("defaultBenchmark", "75/25")
    benchmark = request.benchmark if request.benchmark in rolling_metrics else default_benchmark
    metrics = deepcopy(rolling_metrics.get(benchmark))

    if not metrics:
        return {"error": f"No rolling metrics available for benchmark '{request.benchmark}'"}

    return metrics
