import requests
import pandas as pd
import json
import logging
from pathlib import Path
from datetime import datetime
import io
import re

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# URLs from research
ACWI_URL = "https://www.ishares.com/us/products/239600/ishares-msci-acwi-etf/1521942788811.ajax?fileType=xls&fileName=iShares-MSCI-ACWI-ETF_fund&dataType=fund"
XIC_URL = "https://www.blackrock.com/ca/investors/en/products/239837/ishares-sptsx-capped-composite-index-etf/1515395013957.ajax?fileType=xls&fileName=iShares-SPTSX-Capped-Composite-Index-ETF_fund&dataType=fund"

OUTPUT_FILE = Path(__file__).parent / "data" / "index_exposure.json"

def fetch_and_parse_ishares(url, fund_name):
    logger.info(f"Fetching data for {fund_name} from {url}")
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        # 1. Try standard pandas read_excel
        try:
            df = pd.read_excel(io.BytesIO(response.content))
            return df, response.content
        except Exception as e:
            logger.warning(f"Standard pandas read failed: {e}")

        # 2. Key Fallback: Custom XML parsing with BeautifulSoup
        try:
            from bs4 import BeautifulSoup
            # Handle BOM and encoding
            content_str = response.content.decode('utf-8-sig', errors='replace')
            soup = BeautifulSoup(content_str, 'html.parser')
            
            rows = []
            for row in soup.find_all(['Row', 'row', 'ss:row']):
                row_data = []
                for cell in row.find_all(['Cell', 'cell', 'ss:cell']):
                    data = cell.find(['Data', 'data', 'ss:data'])
                    if data:
                        row_data.append(data.text)
                    else:
                        row_data.append(None)
                if row_data:
                    rows.append(row_data)
            
            if rows:
                df = pd.DataFrame(rows)
                logger.info("Successfully parsed XML with BeautifulSoup.")
                return df, response.content
                
        except Exception as xml_e:
            logger.error(f"XML parsing failed: {xml_e}")

        return None, None
        
    except Exception as e:
        logger.error(f"Failed to fetch {fund_name}: {e}")
        return None, None

def clean_percentage(val):
    if val is None: return 0.0
    try:
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val).replace('%', '').replace(',', '').strip()
        if not s or s.lower() == '-': return 0.0
        return float(s)
    except (ValueError, TypeError):
        return 0.0

def aggregate_holdings(df):
    """
    Aggregates holdings data by Sector and Geography.
    Expects columns like 'Sector', 'Location'/'Country', 'Weight (%)'.
    """
    sectors = {}
    geography = {}
    
    # 1. Find Header Row
    header_idx = -1
    col_map = {} # name -> index
    
    potential_sector_cols = ['sector', 'sector breakdown']
    potential_geo_cols = ['location', 'country', 'geography', 'market / country']
    potential_weight_cols = ['weight (%)', '% of net assets', 'weight', 'market value']
    
    for idx, row in df.iterrows():
        row_vals = [str(x).strip().lower() for x in row.values]
        
        # Check if this row looks like a header
        has_sector = any(c in row_vals for c in potential_sector_cols)
        has_weight = any(c in row_vals for c in potential_weight_cols)
        
        if has_sector and has_weight:
            header_idx = idx
            # Build col map
            for c_idx, val in enumerate(row_vals):
                col_map[val] = c_idx
            break
            
    if header_idx == -1:
        logger.warning("Could not find holdings header row.")
        return {}, {}

    logger.info(f"Found header at row {header_idx}: {col_map.keys()}")

    # Identify indices
    sector_idx = next((col_map[c] for c in potential_sector_cols if c in col_map), None)
    geo_idx = next((col_map[c] for c in potential_geo_cols if c in col_map), None)
    
    # Prioritize % weight, fallback to market value (requires normalization)
    weight_idx = next((col_map[c] for c in ['weight (%)', '% of net assets'] if c in col_map), None)
    use_market_value = False
    if weight_idx is None:
        weight_idx = next((col_map[c] for c in ['market value', 'market value notional'] if c in col_map), None)
        use_market_value = True

    if weight_idx is None:
        logger.warning("Could not find weight column.")
        return {}, {}
    
    logger.info(f"Using indices - Sector: {sector_idx}, Geo: {geo_idx}, Weight: {weight_idx} (Using MV: {use_market_value})")

    total_weight = 0.0
    
    # Whitelist of valid sectors to filter out garbage (dates, numbers, etc.)
    VALID_SECTORS = {
        "information technology", "financials", "industrials", "consumer discretionary",
        "health care", "communication", "communication services", "consumer staples",
        "materials", "energy", "utilities", "real estate",
        "cash", "cash and/or derivatives", "other"
    }

    for i in range(header_idx + 1, len(df)):
        row = df.iloc[i]
        
        # Stop at empty or totals
        if len(row) <= weight_idx: continue
        
        # Extract weight
        w_raw = row.iloc[weight_idx]
        if w_raw is None: continue
        w = clean_percentage(w_raw)
        
        if sector_idx is not None and len(row) > sector_idx:
            sect = str(row.iloc[sector_idx]).strip()
            # Filter out numeric sectors (bad scrape) or invalid values
            if sect and sect.lower() not in ['nan', 'none']:
                sect_lower = sect.lower()
                
                # Check against whitelist
                is_valid = False
                for valid in VALID_SECTORS:
                    if valid in sect_lower: # Substring match (e.g. "Cash" in "Cash & Derivatives")
                        is_valid = True
                        break
                
                # If strictly valid
                if is_valid:
                    sectors[sect] = sectors.get(sect, 0.0) + w

                
        if geo_idx is not None and len(row) > geo_idx:
            geo = str(row.iloc[geo_idx]).strip()
            if geo and geo.lower() != 'nan' and geo.lower() != 'none':
                geography[geo] = geography.get(geo, 0.0) + w
                
        total_weight += w

    # Normalize if using Market Value or if extracted weights sum to ~100 but kept as raw numbers
    # If weights are already %, sum should be ~100.
    # If market value, sum is huge.
    
    if use_market_value or total_weight > 200: # Heuristic: if sum > 200, assume MV or not percent
        logger.info(f"Normalizing weights. Total raw sum: {total_weight}")
        if total_weight > 0:
            for k in sectors: sectors[k] = (sectors[k] / total_weight) * 100
            for k in geography: geography[k] = (geography[k] / total_weight) * 100
            
    return sectors, geography

def extract_date(df):
    for i in range(min(50, len(df))):
        row_str = " ".join([str(x) for x in df.iloc[i].values])
        # "As of 22-Jan-202X" or "Holdings as of..."
        match = re.search(r'as of\s+([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})', row_str, re.IGNORECASE)
        if match:
            d_str = match.group(1).replace(',', '') # Jan 22 2026
            try:
                dt = datetime.strptime(d_str, "%b %d %Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError: pass
            
        match2 = re.search(r'(\d{1,2}-[A-Za-z]{3}-\d{4})', row_str)
        if match2:
            try:
                dt = datetime.strptime(match2.group(1), "%d-%b-%Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError: pass
            
    return datetime.now().strftime("%Y-%m-%d")

def scrape_index_data():
    logger.info("Starting index scrape...")
    
    # --- ACWI ---
    logger.info("Processing ACWI...")
    df_acwi, _ = fetch_and_parse_ishares(ACWI_URL, "ACWI")
    
    data_acwi = {
        "Sectors": {},
        "Geography": {},
        "as_of_date": datetime.now().strftime("%Y-%m-%d")
    }
    
    if df_acwi is not None:
        data_acwi["as_of_date"] = extract_date(df_acwi)
        sec, geo = aggregate_holdings(df_acwi)
        data_acwi["Sectors"] = sec
        data_acwi["Geography"] = geo

    # --- XIC ---
    logger.info("Processing XIC...")
    df_xic, _ = fetch_and_parse_ishares(XIC_URL, "XIC")

    data_xic = {
        "Sectors": {},
        "Geography": {"Canada": 100.0},
        "as_of_date": datetime.now().strftime("%Y-%m-%d")
    }

    if df_xic is not None:
        data_xic["as_of_date"] = extract_date(df_xic)
        sec, _ = aggregate_holdings(df_xic)
        data_xic["Sectors"] = sec

    # Combine
    combined_data = {
        "ACWI": data_acwi,
        "TSX": data_xic,
        "scraped_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    # Save
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(combined_data, f, indent=4)
        
    logger.info(f"Saved index data to {OUTPUT_FILE}")
    return combined_data

if __name__ == "__main__":
    scrape_index_data()
