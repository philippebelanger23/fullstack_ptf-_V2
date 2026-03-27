"""
Validation script: computes returns using the same methodology as the app.
- Uses last-close-on-or-before each boundary date (no gap between periods)
- Applies USD->CAD FX adjustment for US-listed stocks
"""
import yfinance as yf
import pandas as pd

# Define stocks
stocks_ca = ["SU.TO", "CCO.TO", "AFN.TO", "FNV.TO", "GOOGL"]
stocks_us = ["CRM", "UNH", "MSFT", "BRK-B"]
all_stocks = stocks_ca + stocks_us

# Period boundary dates (DD/MM/YYYY display, ISO lookup)
boundary_dates = ["2025-12-31", "2026-01-31", "2026-02-28"]
FX_TICKER = "CAD=X"


def get_price_on_date(ticker, date_str):
    """Get last close on or before date (matches app's get_price_on_date)."""
    date = pd.Timestamp(date_str)
    start = date - pd.Timedelta(days=10)
    data = yf.download(ticker, start=start, end=date + pd.Timedelta(days=1),
                       progress=False, auto_adjust=True)
    if data.empty:
        return None
    if isinstance(data.columns, pd.MultiIndex):
        close = data['Close'][ticker]
    else:
        close = data['Close']
    return float(close.iloc[-1])


# Fetch all prices
print("=" * 80)
print("PRICE AUDIT (last close on or before each boundary date)")
print("=" * 80)

prices = {}
for stock in all_stocks:
    prices[stock] = {}
    for d in boundary_dates:
        prices[stock][d] = get_price_on_date(stock, d)
    p = prices[stock]
    print(f"{stock:10}  31/12/2025={p[boundary_dates[0]]:10.4f}  "
          f"31/01/2026={p[boundary_dates[1]]:10.4f}  "
          f"28/02/2026={p[boundary_dates[2]]:10.4f}")

# Fetch FX prices
fx_prices = {}
for d in boundary_dates:
    fx_prices[d] = get_price_on_date(FX_TICKER, d)
print(f"\n{'CAD=X':10}  31/12/2025={fx_prices[boundary_dates[0]]:10.6f}  "
      f"31/01/2026={fx_prices[boundary_dates[1]]:10.6f}  "
      f"28/02/2026={fx_prices[boundary_dates[2]]:10.6f}")


def compute_return(stock, start_d, end_d):
    """Compute return, FX-adjusted for US stocks."""
    p_start = prices[stock][start_d]
    p_end = prices[stock][end_d]
    if p_start is None or p_end is None:
        return None
    raw_ret = (p_end / p_start) - 1

    # FX adjust for US stocks
    if not stock.endswith('.TO'):
        fx_start = fx_prices[start_d]
        fx_end = fx_prices[end_d]
        if fx_start and fx_end and fx_start != 0:
            fx_ret = (fx_end / fx_start) - 1
            return ((1 + raw_ret) * (1 + fx_ret) - 1) * 100
    return raw_ret * 100


# Compute and display returns
periods = [
    ("JANUARY 2026 (31/12/2025 to 31/01/2026)", boundary_dates[0], boundary_dates[1]),
    ("FEBRUARY 2026 (31/01/2026 to 28/02/2026)", boundary_dates[1], boundary_dates[2]),
]

results = {}
for label, start_d, end_d in periods:
    print(f"\n{'=' * 80}")
    print(f"{label}")
    print(f"{'=' * 80}")
    for stock in all_stocks:
        ret = compute_return(stock, start_d, end_d)
        results[(stock, label)] = ret
        fx_tag = " [FX-adj]" if not stock.endswith('.TO') else ""
        if ret is not None:
            print(f"{stock:10} : {ret:7.2f}%{fx_tag}")
        else:
            print(f"{stock:10} : N/A")

print(f"\n{'=' * 80}")
print("SUMMARY (should match app attribution table exactly)")
print(f"{'=' * 80}")
print(f"{'Stock':<10} {'January':>10} {'February':>10}")
print("-" * 30)
for stock in all_stocks:
    jan = results.get((stock, periods[0][0]))
    feb = results.get((stock, periods[1][0]))
    jan_s = f"{jan:7.2f}%" if jan is not None else "     N/A"
    feb_s = f"{feb:7.2f}%" if feb is not None else "     N/A"
    print(f"{stock:<10} {jan_s:>10} {feb_s:>10}")
