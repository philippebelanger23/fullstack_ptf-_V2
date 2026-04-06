"""Warm cached-yfinance price history for the active portfolio and benchmarks."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

from constants import BENCHMARK_TICKERS, BENCHMARK_BLEND_TICKERS, SECTOR_REFERENCE_TICKERS
from market_data import extract_history_price_series
from services.path_utils import resolve_storage_path
from services.yfinance_parallel import parallel_fetch
from services.yfinance_setup import configure_yfinance_cache

configure_yfinance_cache()

logger = logging.getLogger(__name__)

# Bump this whenever the fetch logic changes (e.g. auto_adjust switch).
# A mismatch between this and the stored version triggers a full re-fetch on startup.
PRICE_HISTORY_VERSION = "v2"  # v2: switched to auto_adjust=True

# Re-fetch if CSVs are older than this many hours (keeps deployed data current).
MAX_CACHE_AGE_HOURS = 24


def load_target_tickers() -> list[str]:
    config_path = resolve_storage_path("data/portfolio_config.json")
    targets: set[str] = set()

    if config_path.exists():
        try:
            payload = json.loads(config_path.read_text(encoding="utf-8"))
            for item in payload.get("tickers", []):
                ticker = str(item.get("ticker", "")).upper().strip()
                if not ticker or ticker == "*CASH*" or item.get("isMutualFund"):
                    continue
                targets.add(ticker)
        except Exception as exc:
            print(f"Warning: could not read {config_path}: {exc}")

    targets.update(
        ticker.upper().strip()
        for ticker in BENCHMARK_TICKERS.values()
        if ticker and ticker != "CAD=X"
    )
    targets.update(
        ticker.upper().strip()
        for ticker in BENCHMARK_BLEND_TICKERS
        if ticker and ticker != "CAD=X"
    )
    targets.update(
        ticker.upper().strip()
        for ticker in SECTOR_REFERENCE_TICKERS
        if ticker
    )

    return sorted(targets)


def _meta_path(output_dir: Path) -> Path:
    return output_dir / ".meta.json"


def _read_meta(output_dir: Path) -> dict:
    p = _meta_path(output_dir)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_meta(output_dir: Path) -> None:
    meta = {
        "version": PRICE_HISTORY_VERSION,
        "last_refresh": datetime.now(timezone.utc).isoformat(),
    }
    _meta_path(output_dir).write_text(json.dumps(meta, indent=2), encoding="utf-8")


def is_refresh_needed(output_dir: Path) -> tuple[bool, str]:
    """Return (needed, reason). Checks version mismatch and cache age."""
    meta = _read_meta(output_dir)

    if meta.get("version") != PRICE_HISTORY_VERSION:
        stored = meta.get("version", "missing")
        return True, f"version mismatch (stored={stored}, current={PRICE_HISTORY_VERSION})"

    last_refresh_str = meta.get("last_refresh")
    if not last_refresh_str:
        return True, "no last_refresh timestamp recorded"

    try:
        last_refresh = datetime.fromisoformat(last_refresh_str)
        age_hours = (datetime.now(timezone.utc) - last_refresh).total_seconds() / 3600
        if age_hours > MAX_CACHE_AGE_HOURS:
            return True, f"cache is {age_hours:.1f}h old (max {MAX_CACHE_AGE_HOURS}h)"
    except Exception:
        return True, "could not parse last_refresh timestamp"

    return False, "cache is fresh"


def fetch_and_save_price_data(output_dir: Path | None = None) -> list[tuple[str, str]]:
    """
    Fetch daily adjusted close data for all tickers and save to CSV.
    Returns list of (ticker, reason) tuples for tickers that failed.
    """
    if output_dir is None:
        output_dir = resolve_storage_path("data/price_history")
    output_dir.mkdir(parents=True, exist_ok=True)

    tickers = load_target_tickers()
    print(f"Fetching daily adjusted close data for {len(tickers)} tickers...")
    print("-" * 60)

    def _fetch_one(ticker: str) -> None:
        # Match the canonical engine: use adjusted close values.
        data = yf.Ticker(ticker).history(period="5y", interval="1d", timeout=5, auto_adjust=True)
        if data.empty:
            raise ValueError("No data returned")

        close_prices = extract_history_price_series(data).dropna()
        if close_prices.empty:
            raise ValueError("No adjusted close column found")

        df = pd.DataFrame({
            "Date": close_prices.index.strftime("%Y-%m-%d"),
            "Adj_Close": close_prices.values,
        })

        safe_filename = ticker.replace(".", "_").replace("-", "_")
        csv_path = output_dir / f"{safe_filename}.csv"
        df.to_csv(csv_path, index=False)

    results, failures = parallel_fetch(tickers, _fetch_one, max_workers=8)
    successful = sorted(results.keys())
    failed = [(ticker, str(exc)) for ticker, exc in failures.items()]

    print("\n" + "=" * 60)
    print(f"SUMMARY: {len(successful)}/{len(tickers)} tickers fetched successfully")

    if failed:
        print(f"\nFailed tickers ({len(failed)}):")
        for ticker, reason in failed:
            print(f"  - {ticker}: {reason}")

    _write_meta(output_dir)
    return failed


def refresh_if_needed(output_dir: Path | None = None) -> bool:
    """
    Check staleness and refresh only if needed. Returns True if a refresh ran.
    Safe to call on every startup — is a no-op when the cache is fresh.
    """
    if output_dir is None:
        output_dir = resolve_storage_path("data/price_history")

    needed, reason = is_refresh_needed(output_dir)
    if not needed:
        logger.info("price history cache is up to date (%s)", reason)
        return False

    logger.info("refreshing price history cache: %s", reason)
    failed = fetch_and_save_price_data(output_dir)
    if failed:
        logger.warning("price history refresh: %d tickers failed: %s", len(failed), failed)
    else:
        logger.info("price history cache refresh complete")
    return True


if __name__ == "__main__":
    failed = fetch_and_save_price_data()
