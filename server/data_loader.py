import pandas as pd
def load_historic_nav_csvs(directory_path):
    """Load historical NAV data from all CSV files in a directory."""
    import os
    from pathlib import Path
    
    nav_dict = {}
    dir_path = Path(directory_path)
    if not dir_path.exists():
        return nav_dict
        
    for csv_file in dir_path.glob("*.csv"):
        ticker = csv_file.stem.upper()
        try:
            df = pd.read_csv(csv_file)
            if "Time" not in df.columns or "Latest" not in df.columns:
                continue
                
            nav_dict[ticker] = {}
            for _, row in df.iterrows():
                try:
                    # Parse date MM/DD/YY as found in the Barchart CSVs
                    date_val = pd.to_datetime(row["Time"], format="%m/%d/%y")
                    nav_val = float(row["Latest"])
                    nav_dict[ticker][date_val] = nav_val
                except Exception:
                    continue
        except Exception as e:
            print(f"Error loading {csv_file}: {e}")
            
    return nav_dict

