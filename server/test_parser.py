
import sys
import os
from pathlib import Path

# Add the server directory to sys.path to import data_loader
sys.path.append(os.getcwd())

from data_loader import load_historic_nav_csvs

def test_loading():
    print("Testing NAV loading robustness...")
    nav_dir = Path("data/historic_navs")
    if not nav_dir.exists():
        print(f"Directory {nav_dir} not found!")
        return
        
    results = load_historic_nav_csvs(str(nav_dir))
    
    for ticker, dates in results.items():
        print(f"Ticker: {ticker}")
        print(f"  Count: {len(dates)}")
        if dates:
            latest_date = max(dates.keys())
            print(f"  Latest Date: {latest_date.strftime('%Y-%m-%d')}")
            print(f"  Latest Value: {dates[latest_date]}")
        print("-" * 20)

if __name__ == "__main__":
    test_loading()
