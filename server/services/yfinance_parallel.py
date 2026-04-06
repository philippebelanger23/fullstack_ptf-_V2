"""Lightweight helpers for running independent yfinance fetches in parallel."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Iterable, TypeVar

T = TypeVar("T")


def parallel_fetch(
    items: Iterable[str],
    worker: Callable[[str], T],
    *,
    max_workers: int = 8,
) -> tuple[dict[str, T], dict[str, Exception]]:
    """
    Run a one-item worker across a set of tickers in parallel.

    Returns (results, failures) keyed by ticker.
    """
    unique_items = [item for item in dict.fromkeys(str(item).strip().upper() for item in items if str(item).strip())]
    if not unique_items:
        return {}, {}

    results: dict[str, T] = {}
    failures: dict[str, Exception] = {}

    with ThreadPoolExecutor(max_workers=min(max_workers, len(unique_items))) as executor:
        future_map = {executor.submit(worker, item): item for item in unique_items}
        for future in as_completed(future_map):
            item = future_map[future]
            try:
                results[item] = future.result()
            except Exception as exc:
                failures[item] = exc

    return results, failures
