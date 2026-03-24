# Touchup Items

Quick improvements and polish tasks for the app.

## Items to Fix

### General / KPIs
- Make the info bubble icons for KPIs clearly more visible (increase size and/or contrast)

### Holdings Tab
- Remove the '31 snapshots' label on the top right of the page
- Increase the font size of the overall ACTUAL TOP 10 - HISTORICAL WEIGHTS section (except the title)

### Return Contribution Tab
- Change the Return Waterfall (Top 10) Total bar fill color to something with better contrast in dark mode (current navy over grey is not working)
- Attribution Analysis tab: gray out bar chart values that equal 0.00%, matching the light mode behavior
- Increase the size of the toggles in the Attribution Analysis section
- Contribution heatmap table: center the values in the Total column
- Contribution heatmap table: increase the font size of all numerical data cells to match the font weight/size of the Total column

### Risk Contribution Tab
- Remove the Historical toggle from the Risk Contribution tab
- Increase the size of the Risk Contribution vs Weight toggle
- Position Risk Detail — when grouping by sector, fill the sector name column header with a solid background color to produce a properly formatted/styled table

### Cross-Tab Consistency
- **Beta values differ across tabs** — Holdings shows ~0.96 (yfinance fundamental beta vs S&P 500), Risk Contribution shows ~0.88, Performance shows ~0.56 even on 1Y. The Risk Contribution and Performance 1Y betas should match exactly since they use the same data window and benchmark. Root cause: despite sharing `build_portfolio_returns()` and `build_benchmark_returns()`, the two endpoints (`/portfolio-backcast` and `/risk-contribution`) still produce different portfolio beta values. Needs deeper investigation — likely a subtle data alignment or computation order difference between the two code paths in `server/routes/risk.py` vs `server/services/backcast_service.py`.
