"""Data loading utilities for portfolio analysis."""

import logging
import pandas as pd
from pathlib import Path

logger = logging.getLogger(__name__)

# Supported date formats for NAV CSVs (order matters - try most common first)
NAV_DATE_FORMATS = [
    "%m/%d/%y",     # Barchart format: 01/15/26
    "%m/%d/%Y",     # Full year: 01/15/2026
    "%Y-%m-%d",     # ISO format: 2026-01-15
    "%d/%m/%Y",     # European format: 15/01/2026
    "%d/%m/%y",     # European short: 15/01/26
    "%d-%b-%Y",     # 15-Jan-2026
    "%d-%b-%y",     # 15-Jan-26
    "%Y/%m/%d",     # 2026/01/15
]


def parse_nav_date(date_str):
    """
    Try multiple date formats to parse a date string.
    
    Args:
        date_str: String representation of a date
        
    Returns:
        pandas.Timestamp or None if parsing fails
    """
    if pd.isna(date_str):
        return None
        
    date_str = str(date_str).strip()
    
    for fmt in NAV_DATE_FORMATS:
        try:
            return pd.to_datetime(date_str, format=fmt)
        except ValueError:
            continue
    
    # Fallback: let pandas infer the format (slower but more flexible)
    try:
        return pd.to_datetime(date_str, dayfirst=False)  # Assume American date format
    except Exception:
        return None


def load_historic_nav_csvs(directory_path):
    """
    Load historical NAV data from all CSV files in a directory.
    
    Supports multiple date formats including:
    - Barchart exports (MM/DD/YY)
    - ISO format (YYYY-MM-DD)
    - European format (DD/MM/YYYY)
    - Various other common formats
    
    Args:
        directory_path: Path to directory containing NAV CSV files
        
    Returns:
        Dictionary mapping ticker -> {date: nav_value}
    """
    nav_dict = {}
    dir_path = Path(directory_path)
    
    if not dir_path.exists():
        logger.warning(f"NAV directory does not exist: {directory_path}")
        return nav_dict
        
    for csv_file in dir_path.glob("*.csv"):
        ticker = csv_file.stem.upper()
        parsed_count = 0
        failed_count = 0
        
        try:
            df = pd.read_csv(csv_file)
            
            # Flexible column detection
            date_col = None
            value_col = None
            
            # 1. Look for date column by name
            for col in df.columns:
                col_lower = str(col).lower()
                if col_lower in ['time', 'date', 'datetime', 'trade date']:
                    date_col = col
                    break
            
            # 2. Look for value column by name
            for col in df.columns:
                col_lower = str(col).lower()
                if col_lower in ['latest', 'nav', 'close', 'adj close', 'price', 'value']:
                    value_col = col
                    break
            
            # 3. Fallback to indices as requested (Column 1 = index 0, Column 5 = index 4)
            if date_col is None and len(df.columns) >= 1:
                date_col = df.columns[0]
                logger.info(f"Ticker {ticker}: Falling back to first column '{date_col}' for dates")
            
            if value_col is None and len(df.columns) >= 5:
                value_col = df.columns[4]
                logger.info(f"Ticker {ticker}: Falling back to fifth column '{value_col}' for NAV")
            
            if date_col is None or value_col is None:
                logger.warning(f"Skipping {csv_file.name}: Could not identify date or value columns.")
                continue
                
            nav_dict[ticker] = {}
            for _, row in df.iterrows():
                try:
                    raw_val = str(row[date_col]).strip()
                    # Skip footer rows
                    if "Downloaded data" in raw_val or raw_val.startswith('"') or not raw_val:
                        continue
                        
                    date_val = parse_nav_date(raw_val)
                    if date_val is None:
                        failed_count += 1
                        continue

                    nav_val = float(str(row[value_col]).replace(',', ''))
                    nav_dict[ticker][date_val] = nav_val
                    parsed_count += 1
                except (ValueError, TypeError, KeyError) as e:
                    failed_count += 1
                    continue
            
            # Log the range to help debug "misread" issues
            if parsed_count > 0:
                dates = sorted(nav_dict[ticker].keys())
                max_date = dates[-1]
                logger.info(f"Loaded {csv_file.name}: {parsed_count} entries. Range: {dates[0]} to {max_date}")
            else:
                logger.warning(f"Loaded {csv_file.name}: 0 entries parsed!")

            if failed_count > 0:
                logger.info(f"Loaded {csv_file.name}: {parsed_count} entries, {failed_count} failed to parse")
                
        except Exception as e:
            logger.error(f"Error loading {csv_file}: {e}")
            
    return nav_dict
