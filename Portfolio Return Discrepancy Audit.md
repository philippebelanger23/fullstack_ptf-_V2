# Portfolio Return Discrepancy Audit

---

## Current Status (as of 2026-03-28)

| Step | Change | Before | After | Gap closed |
|------|--------|--------|-------|------------|
| Baseline | — | Waterfall −4.60%, Graph −1.89% | — | — |
| Fix 1 | Period-aware weights in `/portfolio-backcast` | −1.89% | −4.36% | 2.47% |
| Fix 2 | Correct END-date mapping in `build_period_weighted_portfolio_returns` | −4.36% | −4.44% | 0.08% |
| Fix 3 | YTD base changed from Jan 1 to Dec 31 (prior year) | −4.44% | TBD | TBD |

**Target**: waterfall (Attribution View) = performance graph (Performance View), both on YTD.

---

## Issue 1: Portfolio Return — Remaining Gap

### Original Root Causes (all partially or fully fixed)

| Root cause | Status | Fix applied |
|------------|--------|-------------|
| CASH excluded + weights renormalized in backcast | ✅ Fixed | `aggregate_weights` / `aggregate_period_weights` now keeps CASH with its weight (earns 0%, dilutes equity allocation) |
| Static `max(weight)` across all periods | ✅ Fixed | Replaced `aggregate_weights` with `aggregate_period_weights` + `build_period_weighted_portfolio_returns` — each rebalance period uses its actual weights |
| Period date mapping wrong (dates treated as START, they are END dates) | ✅ Fixed | `build_period_weighted_portfolio_returns` now treats each `date_str` as the period **end**; weights apply from the previous period's end up to (and including) this period's end |
| YTD base misalignment (Jan 2 close vs Dec 31 close) | ✅ Applied (pending verification) | `getDateRangeForPeriod('YTD')` changed to start from `new Date(year-1, 11, 31)` (Dec 31 prior year) in both `PerformanceView.tsx` and `ReportView.tsx` |

---

### Explanation of the Date-Mapping Bug (Fix 2)

`PortfolioItem.date` is the **period end date**, set by `run_portfolio_analysis`:
```python
date_str = period[1].strftime("%Y-%m-%d")   # end of period
```

`convertConfigToItems` sends items with **period start** dates to `/analyze-manual`, but the **response** comes back with period **end** dates. So `portfolioData` in App.tsx always has END dates.

The old `build_period_weighted_portfolio_returns` treated each `date_str` as a START date:
```python
start = pd.Timestamp(date_str)
mask = (returns_df.index >= start) & (returns_df.index < end)  # WRONG
```

With END dates, this applied Dec 2025 allocation to dates **after** the Feb 2026 rebalance — backwards.

The fix:
```python
# Weights for period i apply from the PREVIOUS period's end (exclusive) to THIS period's end (inclusive)
period_end = pd.Timestamp(date_str)
if i == 0:
    mask = returns_df.index <= period_end          # first period: all data up to its end
elif i == n - 1:
    prev_end = pd.Timestamp(period_weights[i-1][0])
    mask = returns_df.index > prev_end             # last period: everything after previous end
else:
    prev_end = pd.Timestamp(period_weights[i-1][0])
    mask = (returns_df.index > prev_end) & (returns_df.index <= period_end)
```

---

### Explanation of the YTD Base Misalignment (Fix 3)

The user's portfolio has a rebalance on **2025-12-31** (last day of 2025). This creates a cross-year period:

- PortfolioItem date = "2026-01-08", `periodStart` = Dec 31 2025
- `returnPct` = `(price_Jan8 / price_Dec31 - 1)` = **starts from Dec 31 close**

The **attribution** for 2026 YTD correctly uses Dec 31 close as the base for this first period.

The **backcast YTD** (old logic: filter `date >= '2026-01-01'`) found the first matching series point at **Jan 2, 2026** (since Jan 1 is a market holiday). The Jan 2 series value already had the Jan 2 daily return baked in, so:

```
Backcast YTD (old) = series_Mar28 / series_Jan2 − 1   ← starts AFTER Jan 2 return
Attribution YTD    = includes Jan 2 return (it's part of Dec31→Jan8 returnPct)
```

The Jan 2 2026 US market was negative (first trading day of 2026), making the attribution ~0.16% more negative than the backcast.

Fix: change YTD base to Dec 31 prior year:
```typescript
// PerformanceView.tsx + ReportView.tsx
case 'YTD':
    return { start: new Date(now.getFullYear() - 1, 11, 31) };
```

Now: `Backcast YTD = series_Mar28 / series_Dec31 − 1` — starts from Dec 31 close, same as the attribution's first period start. This is also the standard financial reporting convention (YTD = since prior-year Dec 31 close).

---

### Residual Gap (if any after Fix 3)

If a gap still remains after Fix 3, remaining candidates in order of likely impact:

1. **FX daily vs period-level compounding** (~0.05–0.1% for a quarter)
   - Attribution uses `(1 + r_period) × (1 + r_fx_period) − 1` (point-to-point FX over whole period)
   - Backcast uses daily `(1 + r_daily) × (1 + r_fx_daily) − 1` chain
   - These differ by a second-order cross-term that grows with FX volatility × equity volatility × their correlation
   - **Not fixable without changing attribution methodology** — backcast is more accurate

2. **Weight normalization rounding** (<0.05%)
   - Backcast renormalizes weights to sum to 1 per period; attribution uses raw entered weights
   - If weights don't exactly sum to 100%, small divergence

3. **Arithmetic vs geometric within each period** (<0.05%)
   - Attribution: `forwardCompoundedContribution` chains period-level returns
   - Backcast: chains daily returns within each period
   - These are equal only if intra-period daily compounding = single-period return from same prices
   - In practice identical (both use yfinance close prices), but floating-point and ffill differences can introduce noise

---

## Issue 2: Benchmark/Index Return (Index Breakdown vs Performance Graph)

| | Index Breakdown | Performance Graph |
|---|---|---|
| Endpoint | `/index-history` | `/portfolio-backcast` |
| Cache | 24-hour file cache | No cache — fresh on every load |
| Download period | `period="5y"` | `period="1y"` |
| FX method | `closes["ACWI"] * closes["USDCAD=X"] → pct_change` | `(1 + r_ACWI) * (1 + r_USDCAD) − 1` |

Primary cause: 24h stale cache in `/index-history`. Secondary: yfinance adjusted closes differ slightly between `5y` and `1y` downloads due to trailing dividend/split adjustment timing.

**Status: Not yet fixed.**

---

## Files Changed

| File | Change |
|------|--------|
| `server/services/backcast_service.py` | Added `aggregate_period_weights()`, replaced `build_period_weighted_portfolio_returns()` with END-date-aware version |
| `server/routes/risk.py` | `/portfolio-backcast` and `/rolling-metrics` use `aggregate_period_weights` + `build_period_weighted_portfolio_returns` |
| `client/App.tsx` | Shared backcast lifted to app level: `fetchPortfolioBackcast(portfolioData)` on portfolio load, passed as `sharedBackcast` prop |
| `client/views/performance/PerformanceView.tsx` | Accepts `sharedBackcast` prop; YTD base changed to Dec 31 prior year |
| `client/views/ReportView.tsx` | Accepts `sharedBackcast` prop; YTD base changed to Dec 31 prior year |
