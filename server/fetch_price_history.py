"""
Fetch daily adjusted close data from yfinance for all Manual Entry tickers.
Saves to CSV files in server/data/price_history/
Reports any tickers that couldn't be fetched.
"""

import yfinance as yf
import pandas as pd
from pathlib import Path
from datetime import datetime

# All tickers from ManualEntryModal.tsx
TICKERS = [
    # Canadian tickers
    "MKB.TO",
    "FNV.TO",
    "CTC-A.TO",
    "BNS.TO",
    "RY.TO",
    "TD.TO",
    "T.TO",
    "CCO.TO",
    "ENB.TO",
    "SU.TO",
    "CVE.TO",
    "CP.TO",
    "WCN.TO",
    "AFN.TO",
    "WSP.TO",
    "MRU.TO",
    "ATD.TO",
    "XUS.TO",
    "TECH-B.TO",
    "CM.TO",
    "CPX.TO",
    
    # US tickers
    "BRK-B",
    "BA",
    "GOOGL",
    "CRWD",
    "MSFT",
    "UNH",
    "CRM",
    "AMZN",
    "PANW",
    "COST",
    
    # Mutual Funds / ETFs that may not have ticker data
    "BIP791",
    "DJT03868", 
    "TDB3173",
    "DYN245",
    "MFC8625",
]

def fetch_and_save_price_data(output_dir: Path = Path("data/price_history")):
    """
    Fetch daily adjusted close data for all tickers and save to CSV.
    Returns list of tickers that failed to fetch.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    successful = []
    failed = []
    
    print(f"Fetching daily adjusted close data for {len(TICKERS)} tickers...")
    print("-" * 60)
    
    for ticker in TICKERS:
        try:
            print(f"Fetching {ticker}...", end=" ")
            
            # Use Ticker object for single ticker (more reliable)
            t = yf.Ticker(ticker)
            data = t.history(period="5y", interval="1d")
            
            if data.empty:
                print(f"FAILED - No data returned")
                failed.append((ticker, "No data returned"))
                continue
            
            # Get Close column (history() uses 'Close' not 'Adj Close')
            if 'Close' in data.columns:
                close_prices = data['Close']
            else:
                print(f"FAILED - No Close column found")
                failed.append((ticker, "No Close column"))
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
    print(f"Successfully fetched: {len(successful)}/{len(TICKERS)} tickers")
    
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
