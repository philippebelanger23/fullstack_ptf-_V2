"""Audit: compare get_price_on_date (10-day window) vs full-period download."""
import yfinance as yf
import pandas as pd

stocks_ca = ["SU.TO", "CCO.TO", "AFN.TO", "FNV.TO"]
stocks_us = ["CRM", "UNH", "MSFT", "BRK-B"]
dates = ["2025-12-31", "2026-01-31", "2026-02-28"]

print("=" * 90)
print("METHOD 1: Full-period download (compute_returns.py style)")
print("=" * 90)

for stock in stocks_ca + stocks_us:
    data = yf.download(stock, start="2025-12-31", end="2026-02-28", progress=False, auto_adjust=True)
    if isinstance(data.columns, pd.MultiIndex):
        close = data['Close'][stock]
    else:
        close = data['Close']
    p0 = float(close.iloc[0])
    # Find Jan 30 (last trading day before Jan 31 weekend)
    jan_end_idx = close.index.get_indexer([pd.Timestamp("2026-01-30")], method='ffill')[0]
    p1 = float(close.iloc[jan_end_idx])
    p_last = float(close.iloc[-1])
    jan_ret = (p1 / p0 - 1) * 100
    feb_ret = (p_last / p1 - 1) * 100
    print(f"{stock:10} Dec31={p0:10.4f}  Jan30={p1:10.4f}  Feb27={p_last:10.4f}  "
          f"JanRet={jan_ret:7.2f}%  FebRet={feb_ret:7.2f}%")

print()
print("=" * 90)
print("METHOD 2: get_price_on_date style (separate 10-day windows per date)")
print("=" * 90)

def get_price_window(ticker, date_str):
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

for stock in stocks_ca + stocks_us:
    p0 = get_price_window(stock, "2025-12-31")
    p1 = get_price_window(stock, "2026-01-31")
    p2 = get_price_window(stock, "2026-02-28")
    jan_ret = (p1 / p0 - 1) * 100 if p0 and p1 else None
    feb_ret = (p2 / p1 - 1) * 100 if p1 and p2 else None
    print(f"{stock:10} Dec31={p0:10.4f}  Jan31~={p1:10.4f}  Feb28~={p2:10.4f}  "
          f"JanRet={jan_ret:7.2f}%  FebRet={feb_ret:7.2f}%")

print()
print("=" * 90)
print("DIFFERENCE (Method2 - Method1)")
print("=" * 90)
print("If these differ, the 10-day window returns different adjusted prices than full-range.")
