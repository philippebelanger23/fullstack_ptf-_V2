
import pandas as pd
import json
import os
from pathlib import Path
import datetime

# Configuration
EXCEL_PATH = r"G:\My Drive\Google_GitHub\Return_Contribution_Files\PERF_FM.xlsx"
OUTPUT_PATH = r"server\data\manual_navs.json"

def import_excel_navs():
    print(f"Reading Excel: {EXCEL_PATH}...")
    
    try:
        # Read Excel - parsing dates automatically
        df = pd.read_excel(EXCEL_PATH)
        
        # Structure to hold our data: ticker -> {date_str: price}
        nav_data = {}
        
        # Load existing if available to update it, otherwise create new
        if os.path.exists(OUTPUT_PATH):
            with open(OUTPUT_PATH, 'r') as f:
                try:
                    nav_data = json.load(f)
                    print(f"Loaded existing data for {len(nav_data)} tickers")
                except json.JSONDecodeError:
                    print("Existing JSON was empty or invalid, starting fresh.")
        
        # Iterate through the DataFrame rows
        # Assumes format: Ticker | Date1 | Date2 | ...
        for index, row in df.iterrows():
            ticker = str(row['Ticker']).strip().upper()
            if not ticker or ticker == 'nan':
                continue
                
            if ticker not in nav_data:
                nav_data[ticker] = {}
            
            # Iterate through columns (dates)
            count = 0
            for col in df.columns:
                if col == 'Ticker':
                    continue
                
                # Check if the column name is a datetime object (which pandas usually converts Excel dates to)
                date_str = None
                if isinstance(col, datetime.datetime):
                   try:
                       # Only include 2025 dates as requested
                       if col.year == 2025:
                           date_str = col.strftime("%Y-%m-%d")
                   except:
                       pass
                
                if date_str:
                    val = row[col]
                    # Check if value is valid number
                    try:
                        val_float = float(val)
                        if val_float > 0:
                            nav_data[ticker][date_str] = val_float
                            count += 1
                    except (ValueError, TypeError):
                        pass
            
            if count > 0:
                print(f"Updated {ticker}: added {count} entries for 2025")

        # Write back to JSON
        with open(OUTPUT_PATH, 'w') as f:
            json.dump(nav_data, f, indent=2)
            
        print(f"Successfully saved to {OUTPUT_PATH}")
        
    except Exception as e:
        print(f"Error importing Excel: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    import_excel_navs()
