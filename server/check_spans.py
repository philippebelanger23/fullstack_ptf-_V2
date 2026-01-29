
import sys
import os
import json
from datetime import datetime

# Add current directory to path to import data_loader
sys.path.append(os.getcwd())
try:
    from data_loader import load_historic_nav_csvs
except ImportError:
    # Fallback if running from root
    sys.path.append(os.path.join(os.getcwd(), 'server'))
    from server.data_loader import load_historic_nav_csvs

def check_spans():
    # 1. Load CSVs
    print("Loading CSVs from data/historic_navs...")
    # Adjust path if running from root
    csv_path = "server/data/historic_navs" if os.path.exists("server/data/historic_navs") else "data/historic_navs"
    csv_data = load_historic_nav_csvs(csv_path)

    # 2. Load JSON
    print("Loading JSON from data/manual_navs.json...")
    json_path = "server/data/manual_navs.json" if os.path.exists("server/data/manual_navs.json") else "data/manual_navs.json"
    
    json_data = {}
    if os.path.exists(json_path):
        with open(json_path, "r") as f:
            raw_json = json.load(f)
            # format is ticker -> date_str -> value
            for ticker, dates_dict in raw_json.items():
                json_data[ticker] = {}
                for d_str, val in dates_dict.items():
                    try:
                        dt = datetime.strptime(d_str, "%Y-%m-%d")
                        json_data[ticker][dt] = val
                    except:
                        pass
    else:
        print(f"Warning: {json_path} not found")

    # 3. Merge
    all_tickers = set(csv_data.keys()) | set(json_data.keys())
    final_stats = {}

    for t in all_tickers:
        dates = []
        if t in csv_data:
            dates.extend(csv_data[t].keys())
        if t in json_data:
            dates.extend(json_data[t].keys())
        
        if dates:
            min_date = min(dates)
            max_date = max(dates)
            count = len(dates)
            final_stats[t] = (min_date, max_date, count)

    # 4. Print
    print("\n" + "="*60)
    print(f"{'Ticker':<15} | {'Start Date':<12} | {'End Date':<12} | {'Count':<6}")
    print("-" * 60)
    for t, (start, end, count) in sorted(final_stats.items()):
        print(f"{t:<15} | {start.strftime('%Y-%m-%d'):<12} | {end.strftime('%Y-%m-%d'):<12} | {count:<6}")
    print("="*60 + "\n")

if __name__ == "__main__":
    check_spans()
