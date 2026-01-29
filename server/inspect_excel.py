
import pandas as pd
import sys

file_path = r"G:\My Drive\Google_GitHub\Return_Contribution_Files\PERF_FM.xlsx"

try:
    # Read the first sheet to see columns
    df = pd.read_excel(file_path, nrows=5)
    print("Columns found:")
    print(df.columns.tolist())
    print("\nFirst 5 rows:")
    print(df.to_string())
    
    # Check sheet names
    xl = pd.ExcelFile(file_path)
    print("\nSheet names:")
    print(xl.sheet_names)
except Exception as e:
    print(f"Error: {e}")
