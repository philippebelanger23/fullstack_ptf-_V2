"""Data loading functions for portfolio weights and NAV files."""

import pandas as pd


def load_weights_file(file_path):
    """Load portfolio weights from Excel file."""
    try:
        df = pd.read_excel(file_path)
        if "Ticker" not in df.columns:
            raise ValueError("'Ticker' column not found in weights file")
        
        tickers = df["Ticker"].tolist()
        date_cols = [col for col in df.columns if col != "Ticker"]
        
        weights_dict = {}
        for idx, ticker in enumerate(tickers):
            weights_dict[ticker] = {}
            for date_col in date_cols:
                try:
                    date_val = pd.to_datetime(date_col, format="%d/%m/%Y")
                    weight_val = df.iloc[idx][date_col]
                    if pd.isna(weight_val):
                        continue
                    
                    if isinstance(weight_val, str):
                        is_percentage = '%' in weight_val
                        weight_val = weight_val.replace('%', '').strip()
                        weight_val = float(weight_val)
                        
                        if is_percentage:
                            weight_val = weight_val / 100.0
                    else:
                        weight_val = float(weight_val)
                    
                    # If value is already a decimal (< 1) and WAS NOT a percentage string, use as-is
                    # If value is >= 1, assume it's a percentage and divide by 100
                    # Note: This heuristic is skipped if we already handled the % sign
                    if not isinstance(df.iloc[idx][date_col], str) or '%' not in str(df.iloc[idx][date_col]):
                         if weight_val >= 1.0:
                             weight_val = weight_val / 100.0
                    
                    weights_dict[ticker][date_val] = weight_val
                except Exception as e:
                    raise ValueError(f"Error parsing date '{date_col}' or weight value: {e}")
        
        return weights_dict, sorted(date_cols, key=lambda x: pd.to_datetime(x, format="%d/%m/%Y"))
    except Exception as e:
        raise ValueError(f"Error loading weights file: {str(e)}")


def load_nav_file(file_path):
    """Load mutual fund NAV data from Excel file."""
    try:
        df = pd.read_excel(file_path)
        if "Ticker" not in df.columns:
            raise ValueError("'Ticker' column not found in NAV file")
        
        tickers = df["Ticker"].tolist()
        date_cols = [col for col in df.columns if col != "Ticker"]
        
        nav_dict = {}
        for idx, ticker in enumerate(tickers):
            nav_dict[ticker] = {}
            for date_col in date_cols:
                try:
                    date_val = pd.to_datetime(date_col, format="%d/%m/%Y")
                    nav_val = df.iloc[idx][date_col]
                    if pd.isna(nav_val):
                        continue
                    nav_dict[ticker][date_val] = float(nav_val)
                except Exception as e:
                    raise ValueError(f"Error parsing date '{date_col}' or NAV value: {e}")
        
        return nav_dict
    except Exception as e:
        raise ValueError(f"Error loading NAV file: {str(e)}")


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

