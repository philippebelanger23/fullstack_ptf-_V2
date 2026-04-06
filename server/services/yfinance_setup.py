"""Shared yfinance runtime configuration."""

from __future__ import annotations

import logging
from pathlib import Path

import yfinance as yf
import yfinance.cache as yf_cache

from services.path_utils import resolve_storage_path

logger = logging.getLogger(__name__)

_CACHE_CONFIGURED = False


def configure_yfinance_cache() -> Path:
    """Force yfinance cache files into the repo's writable cache directory."""
    global _CACHE_CONFIGURED

    cache_dir = resolve_storage_path(".cache/yfinance")
    cache_dir.mkdir(parents=True, exist_ok=True)

    if _CACHE_CONFIGURED:
        return cache_dir

    try:
        yf_cache.set_cache_location(str(cache_dir))
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to configure yfinance cache location: %s", exc)

    try:
        yf.set_tz_cache_location(str(cache_dir))
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to configure yfinance tz cache location: %s", exc)

    _CACHE_CONFIGURED = True
    return cache_dir
