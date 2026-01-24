# Return_Contribution_Python

## How to Run

1.  **Navigate to the server directory:**
    ```bash
    cd server
    ```
2.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the Server:**
    ```bash
    python main.py
    ```
    Or with uvicorn directly:
    ```bash
    uvicorn main:app --reload
    ```


## How to Run

1.  **Navigate to the server directory:**
    ```bash
    cd server
    ```
2.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run the Server:**
    ```bash
    python main.py
    ```
    Or with uvicorn directly:
    ```bash
    uvicorn main:app --reload
    ```


## Project Description

This R script generates a fully automated, professional-grade Excel report for portfolio performance and attribution analysis. It reads two input Excel files: (1) portfolio weights (tickers in column 1, weights per date in subsequent columns), and (2) mutual fund NAV history (same structure, used when Yahoo Finance data is unavailable). It fetches real-time market prices via quantmod (Yahoo Finance) for stocks (.TO for TSX), ETFs, indices (^GSPC, ^DJI, ^IXIC, ACWI, ^GSPTSE), and FX (CAD=X). For each period between weight dates, it computes: Return = (P_end / P_start) – 1, Contribution = Weight × Return, and applies CAD adjustment to non-CAD, non-mutual-fund assets using multiplicative FX return: (1 + R_asset) × (1 + R_FX) – 1. The special ticker *cash* is forced to 0% return and contribution in all periods, including YTD. Cumulative (YTD) metrics are calculated as total return from first to last date and sum of period contributions. The data frame is structured with columns grouped per period: Weight | Return | Contrib. | (spacer), followed by YTD Return | YTD Contrib.. Holdings are sorted by descending YTD contribution. A TOTAL row shows: weight sum = 100.00%, contribution sums per period and YTD, and blank returns. A blank spacer row separates holdings from benchmarks. Benchmarks (USD/CAD, S&P 500, Dow Jones, Nasdaq, ACWI, TSX60) display returns only (in domestic currency), with weights and contributions blank. The Excel output uses openxlsx to create: a merged title, period spanners (e.g., "01/01/2025 to 31/03/2025"), cumulative header, full % formatting (0.00%) on all numeric cells, conditional formatting (green if ≥0, red if <0 on all Contrib. and YTD Contrib. columns), weight change background (green tint if increase, red tint if decrease vs prior period), bold-italic holdings, blue-filled TOTAL row, color-coded benchmark rows (yellow, blue, red), optimized column widths, and right-aligned footnotes ("Benchmarks Returns are in Domestic Currency", "Portfolio Holdings Returns are CAD Adjusted"). All numeric columns are safely converted to numeric and scaled ×100 before writing to Excel to ensure correct % display. The script is fully dynamic (any number of periods/tickers), robust (tryCatch on data fetch), and requires internet. Output saved to C:/Users/Phili/Downloads/table_output.xlsx (overwrites). To port to Python, replicate: (1) pandas for data handling, (2) yfinance for market data, (3) xlwings or openpyxl + pandas.Style for formatting, (4) identical logic for FX, *cash*, TOTAL, sorting, and blanking, (5) exact styling via cell-level formatting (merged cells, conditional rules, colors, number formats). Requires: pandas, yfinance, openpyxl, xlwings (optional), internet. This design ensures audit-ready, client-facing output with zero manual intervention.

---

## Requirements Questionnaire

### Input & Data Files

**Portfolio Weights File:**
1. Column 1 header name: `[ANSWER: e.g., "Ticker"]`
2. Date column header format: `[ANSWER: e.g., "2025-01-31" or "01/31/2025"]`
3. Weight values format: `[ANSWER: decimals (0.15) or percentages (15%)]`
4. Handling missing dates/weights: `[ANSWER: e.g., skip, use 0, use previous value]`

**Mutual Fund NAV File:**
5. Same structure as weights file? `[ANSWER: Yes/No]`
6. When to use NAV vs Yahoo Finance: `[ANSWER: e.g., If ticker is in NAV file, skip Yahoo Finance]`
7. NAV file ticker column header: `[ANSWER: e.g., "Ticker" or "Fund"]`

**Tickers:**
8. Known suffixes (e.g., .TO for TSX): `[ANSWER: list all known patterns]`
9. How to identify asset types: `[ANSWER: How to distinguish indices vs stocks vs ETFs vs FX]`
10. Tickers not fetchable via Yahoo Finance: `[ANSWER: list any special cases]`

### Data Fetching & Calculations

**Market Data:**
11. For indices like ^GSPC, fetch prices or returns directly? `[ANSWER: prices/returns]`
12. Date alignment strategy: `[ANSWER: If weight date is missing, use prior available price?]`
13. Handle holidays/weekends: `[ANSWER: Use prior trading day? Yes/No]`

**FX (CAD=X):**
14. Base currency: `[ANSWER: e.g., CAD]`
15. Use CAD=X for all non-CAD assets? `[ANSWER: Yes/No]`
16. If asset is already in CAD, skip FX adjustment? `[ANSWER: Yes/No]`

**Period Calculations:**
17. Period calculation logic: `[ANSWER: If dates are [2025-01-01, 2025-03-31, 2025-06-30], are periods: Jan 1–Mar 31, Mar 31–Jun 30? OR Jan 1–Mar 31, Jan 1–Jun 30 (cumulative)?]`

**Special Tickers:**
18. *cash* exact ticker string: `[ANSWER: case-sensitive? Any variations?]`

### Output Formatting

**Excel Structure:**
19. Title text: `[ANSWER: e.g., "Portfolio Performance Report"]`
20. Title row count: `[ANSWER: number of rows to merge]`
21. Period spanners scope: `[ANSWER: span only date columns, or include Weight/Return/Contrib. columns?]`
22. Column order confirmation: `[ANSWER: Weight | Return | Contrib. per period, then YTD Return | YTD Contrib.?]`

**Formatting Details:**
23. Conditional formatting scope: `[ANSWER: Apply to all Contrib. columns (period + YTD)? Yes/No]`
24. Weight change background comparison: `[ANSWER: Compare to immediate prior period? Yes/No]`
25. Benchmark colors: `[ANSWER: Specific hex codes? e.g., yellow #FFFF00, blue #0000FF, red #FF0000]`
26. Column widths: `[ANSWER: auto-fit or fixed? If fixed, specify widths]`

**TOTAL Row:**
27. Include TOTAL in YTD calculations? `[ANSWER: Yes/No]`
28. Show blank for Return columns (period and YTD)? `[ANSWER: Yes/No]`

**Benchmarks:**
29. Always include all six benchmarks? `[ANSWER: Yes/No - or only those present in data?]`
30. Benchmark display order: `[ANSWER: e.g., USD/CAD, S&P 500, Dow Jones, Nasdaq, ACWI, TSX60]`

### Technical & Error Handling

**Error Handling:**
31. If ticker fails to fetch: `[ANSWER: skip, use zero return, or halt?]`
32. If input Excel is malformed: `[ANSWER: specific error message or generic?]`

**Output File:**
33. File overwrite behavior: `[ANSWER: overwrite existing, or create new file with timestamp?]`
34. Output file path: `[ANSWER: e.g., C:/Users/Phili/Downloads/table_output.xlsx]`

**Performance:**
35. Typical portfolio size: `[ANSWER: number of tickers and dates]`
36. Any time constraints: `[ANSWER: e.g., must complete in under 5 minutes]`

**Dependencies:**
37. Preferred libraries: `[ANSWER: Any specific versions or constraints?]`
38. Python version: `[ANSWER: e.g., Python 3.8+ or specific version]`

**Testing:**
39. Sample input files: `[ANSWER: Will you provide them, or should I create mock data?]`
40. Specific test cases to handle: `[ANSWER: List any edge cases or special scenarios]`
