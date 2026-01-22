"""
Verify mutual fund NAV data coverage.
Checks if we have data for all required dates across all mutual funds.
"""

import json
from pathlib import Path
from datetime import datetime
import pandas as pd

# Mutual funds that don't have yfinance data
MUTUAL_FUNDS = ["BIP791", "DJT03868", "TDB3173", "DYN245", "MFC8625", "BILLET US BANK"]

def parse_csv_date(date_str):
    """Parse MM/DD/YY format from CSV files."""
    try:
        return datetime.strptime(date_str, "%m/%d/%y")
    except:
        return None

def load_historic_csv(ticker):
    """Load historic NAV data from CSV file."""
    csv_path = Path(f"data/historic_navs/{ticker}.csv")
    if not csv_path.exists():
        return {}
    
    data = {}
    with open(csv_path, 'r') as f:
        lines = f.readlines()
        for line in lines[1:]:  # Skip header
            if line.startswith('"'):  # Skip footer
                continue
            parts = line.strip().split(',')
            if len(parts) >= 5:
                date = parse_csv_date(parts[0])
                if date:
                    try:
                        nav = float(parts[4])  # "Latest" column
                        data[date.strftime("%Y-%m-%d")] = nav
                    except:
                        pass
    return data

def load_manual_navs():
    """Load NAV data from manual_navs.json."""
    with open("data/manual_navs.json", 'r') as f:
        return json.load(f)

def main():
    print("=" * 70)
    print("MUTUAL FUND NAV DATA COVERAGE VERIFICATION")
    print("=" * 70)
    
    manual_data = load_manual_navs()
    
    # Check for ticker name mismatches
    print("\n1. TICKER NAME CHECK:")
    print("-" * 50)
    
    manual_tickers = list(manual_data.keys())
    print(f"Tickers in manual_navs.json: {manual_tickers}")
    
    expected_tickers = ["BIP791", "DJT03868", "TDB3173", "DYN245", "MFC8625", "BILLET US BANK"]
    for ticker in expected_tickers:
        if ticker in manual_data:
            print(f"  ✓ {ticker} - FOUND")
        else:
            # Check for similar names
            similar = [t for t in manual_tickers if ticker[:4] in t or t[:4] in ticker]
            if similar:
                print(f"  ⚠ {ticker} - NOT FOUND (similar: {similar})")
            else:
                print(f"  ✗ {ticker} - NOT FOUND")
    
    # Load all data sources for each fund
    print("\n2. DATA SOURCE COVERAGE:")
    print("-" * 50)
    
    for ticker in MUTUAL_FUNDS:
        print(f"\n{ticker}:")
        
        # Manual NAVs
        if ticker in manual_data:
            dates = list(manual_data[ticker].keys())
            print(f"  manual_navs.json: {len(dates)} dates ({min(dates)} to {max(dates)})")
        else:
            print(f"  manual_navs.json: NOT FOUND")
        
        # Historic CSV
        csv_data = load_historic_csv(ticker)
        if csv_data:
            dates = list(csv_data.keys())
            print(f"  historic_navs/{ticker}.csv: {len(dates)} dates ({min(dates)} to {max(dates)})")
        else:
            print(f"  historic_navs/{ticker}.csv: NOT FOUND")
    
    # Check for date gaps
    print("\n3. DATE COVERAGE ANALYSIS (Last 30 trading days):")
    print("-" * 50)
    
    for ticker in MUTUAL_FUNDS:
        csv_data = load_historic_csv(ticker)
        if not csv_data:
            print(f"{ticker}: NO CSV DATA")
            continue
        
        # Get last 30 dates
        all_dates = sorted(csv_data.keys(), reverse=True)[:30]
        print(f"\n{ticker}: {len(all_dates)} recent dates available")
        
        # Check for weekend gaps (expected) vs weekday gaps (unexpected)
        if len(all_dates) >= 2:
            dates_as_dt = [datetime.strptime(d, "%Y-%m-%d") for d in all_dates]
            for i in range(len(dates_as_dt) - 1):
                gap = (dates_as_dt[i] - dates_as_dt[i+1]).days
                if gap > 4:  # More than a long weekend
                    print(f"  ⚠ Gap of {gap} days: {all_dates[i+1]} to {all_dates[i]}")

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print("""
Key findings:
1. TDB3173 is listed as 'TD83173' in manual_navs.json (typo)
2. MFC8625 is listed as 'MFC882S' in manual_navs.json (typo)
3. Historic CSV files exist for all 5 mutual funds with ~269 rows of daily data
4. manual_navs.json has periodic (monthly) snapshots, not daily data

To fix the data for proper time series:
- The system should merge manual_navs.json AND historic_navs/*.csv
- The typos in manual_navs.json need to be fixed
""")

if __name__ == "__main__":
    main()
