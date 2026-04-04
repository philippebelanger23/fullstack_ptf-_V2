"""Warm cached-yfinance price history for the active portfolio and benchmarks."""

import json
from pathlib import Path

import pandas as pd
import yfinance as yf

from constants import BENCHMARK_TICKERS
from market_data import extract_history_price_series
from services.path_utils import resolve_storage_path
from services.yfinance_setup import configure_yfinance_cache

configure_yfinance_cache()


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

    return sorted(targets)

def fetch_and_save_price_data(output_dir: Path = Path("data/price_history")):
    """
    Fetch daily adjusted close data for all tickers and save to CSV.
    Returns list of tickers that failed to fetch.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    tickers = load_target_tickers()
    successful = []
    failed = []
    
    print(f"Fetching daily adjusted close data for {len(tickers)} tickers...")
    print("-" * 60)
    
    for ticker in tickers:
        try:
            print(f"Fetching {ticker}...", end=" ")
            
            # Match the canonical engine: use adjusted close values.
            data = yf.Ticker(ticker).history(period="5y", interval="1d", timeout=5, auto_adjust=False)

            if data.empty:
                print(f"FAILED - No data returned")
                failed.append((ticker, "No data returned"))
                continue

            close_prices = extract_history_price_series(data).dropna()
            if close_prices.empty:
                print(f"FAILED - No adjusted close column found")
                failed.append((ticker, "No adjusted close column"))
                continue
            
            # Create DataFrame with date and close price
            df = pd.DataFrame({
                'Date': close_prices.index.strftime('%Y-%m-%d'),
                'Adj_Close': close_prices.values
            })
            
            # Save to CSV
            safe_filename = ticker.replace(".", "_").replace("-", "_")
            csv_path = output_dir / f"{safe_filename}.csv"
            df.to_csv(csv_path, index=False)
            
            print(f"OK - {len(df)} rows saved to {csv_path.name}")
            successful.append(ticker)
            
        except Exception as e:
            print(f"FAILED - {str(e)[:60]}")
            failed.append((ticker, str(e)))
    
    print("\n" + "=" * 60)
    print(f"SUMMARY")
    print("=" * 60)
    print(f"Successfully fetched: {len(successful)}/{len(tickers)} tickers")
    
    if successful:
        print(f"\nSuccessful tickers:")
        for t in successful:
            print(f"  ✓ {t}")
    
    if failed:
        print(f"\n❌ Failed tickers ({len(failed)}):")
        for ticker, reason in failed:
            print(f"  - {ticker}: {reason}")
    else:
        print("\nAll tickers fetched successfully!")
    
    return failed

if __name__ == "__main__":
    failed = fetch_and_save_price_data()
