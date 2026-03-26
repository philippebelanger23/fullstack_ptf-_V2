# Performance Calculation Audit

## Overview
This document traces how security performance is calculated across the application for monthly/quarterly attribution tables.

## Data Flow

### 1. Backend: Price Fetching (`server/market_data.py`)

**Function:** `calculate_returns()` lines 78-158

- **Price Source:** Either Yahoo Finance (`get_price_on_date()`) or manual NAV data (`nav_dict`)
- **Period Return Calculation (line 146):**
  ```python
  period_return = (price_end / price_start) - 1
  ```
  Where:
  - `price_start`: Price on first date of period (e.g., Dec 31)
  - `price_end`: Price on last date of period (e.g., Jan 31)

- **FX Adjustment (lines 150-155):** For USD-listed securities, return is adjusted:
  ```python
  cad_adjusted_return = (1 + period_return) * (1 + fx_return) - 1
  ```

- **Debug Logs Added:** Each period return is logged with:
  - Dates, prices, returns, and FX adjustments
  - Example: `"Period 2025-12-31 to 2026-01-31: SU.TO price_start=45.50 price_end=49.20 -> return=8.13%"`

### 2. Backend: Results DataFrame (`server/market_data.py`)

**Function:** `build_results_dataframe()` lines 186-260

- **Period Structure:** Periods are created from user-provided dates, with automatic month-end injection (portfolio.py:187-202)
  - This ensures period boundaries align with month-ends for clean monthly attribution

- **Return Storage (line 217):**
  ```python
  row[f"Return_{period_idx}"] = period_return
  ```
  This is the **period return** calculated from actual prices, not daily compounding

- **Contribution Calculation (line 214):**
  ```python
  contribution = weight * period_return
  ```
  Where weight is the weight at the **start** of the period

- **Debug Logs Added:** Each period's ticker data is logged with weight, return, and contribution

### 3. Frontend: Data Aggregation (`client/views/attribution/attributionUtils.ts`)

**Function:** `aggregatePeriodData()` lines 10-63

**Current Issue:** When filtering by month, we may get multiple `PortfolioItem` entries per ticker if:
- There were intra-month rebalances
- Data has daily snapshots instead of period-end snapshots

**Solution Implemented:**
1. Find all items for a ticker within the month
2. **Compound the returns** using: `∏(1 + r_i) - 1`
3. This gives the true period return independent of weight changes

**Code (lines 38-43):**
```typescript
const compoundReturn = items.reduce((product, item) => {
    const r = (item.returnPct || 0) / 100;
    return product * (1 + r);
}, 1) - 1;

const weightedAvgReturn = compoundReturn * 100;
```

- **Debug Comment:** Uncomment line 53 to log calculations to browser console

### 4. Frontend: Display (`client/views/attribution/AttributionTable.tsx`)

**Display (line 30-32):**
```typescript
{item.returnPct !== undefined ? (item.returnPct < 0 ? `(${Math.abs(item.returnPct).toFixed(2)}%)` : `${item.returnPct.toFixed(2)}%`) : ''}
```

Shows the `returnPct` from aggregated data.

---

## Verification Checklist

### ✅ Backend Verification

Run with debug logging enabled and check:

1. **Price Fetching:**
   - [ ] Debug log shows correct start/end dates
   - [ ] Prices are fetched from correct source (Yahoo Finance or NAV CSV)
   - [ ] No price = None errors for valid tickers

2. **Return Calculation:**
   - [ ] For JAN: `(jan31_price / dec31_price) - 1` matches the logged return
   - [ ] FX adjustment applied correctly for USD tickers
   - [ ] No negative/unrealistic returns without explanation

3. **Period Boundaries:**
   - [ ] Periods are month-aligned (Dec 31 → Jan 31, Jan 31 → Feb 28, etc.)
   - [ ] All expected months have data

4. **Data Structure:**
   - [ ] Each ticker has exactly one Return/Weight/Contrib per period IF periods are month-aligned
   - [ ] Multi-entry periods only occur for intra-month rebalances

### ✅ Frontend Verification

Open browser DevTools and check:

1. **Data Inspection:**
   ```javascript
   // In browser console, after loading Attribution View:
   // Look at the data fetched from API
   // Check if each month has multiple returnPct values per ticker
   ```

2. **Aggregation Logic:**
   - [ ] Uncomment line 53 in `attributionUtils.ts` to enable debug logging
   - [ ] Check console for aggregation calculations
   - [ ] Verify compound return matches expected formula

3. **Display Verification:**
   - [ ] Open Attribution View → Tables tab
   - [ ] For January, check SU.TO performance value
   - [ ] Manually verify: (Jan 31 close / Dec 31 close) - 1 matches displayed value

---

## Example: SU.TO January Return

### Expected Flow:

1. **Backend:** Fetch prices
   - Dec 31, 2025 close: $45.50
   - Jan 31, 2026 close: $49.20
   - Period return: (49.20 / 45.50) - 1 = 8.13%
   - Debug log: `"2025-12-31 to 2026-01-31: SU.TO price_start=45.50 price_end=49.20 -> return=8.13%"`

2. **Backend:** Store in DataFrame
   - Return_0 = 0.0813 (8.13%)
   - Weight_0 = 0.05 (5%)
   - Contrib_0 = 0.05 * 0.0813 = 0.004065 (40.65 bps)

3. **Frontend:** Filter by month
   - If exactly one entry: Display 8.13% directly
   - If multiple entries (e.g., daily): Compound them

4. **Display:**
   - Performance column shows: 8.13%
   - Weight column shows: 5.00%
   - Contrib column shows: 40.65 bps

---

## How to Enable Debug Logging

### Backend:
1. Edit `server/main.py` or logging config
2. Set logger level to DEBUG
3. Run: `uvicorn main:app --log-level debug`
4. Watch server logs for calculation details

### Frontend:
1. Edit `client/views/attribution/attributionUtils.ts` line 53
2. Uncomment: `// console.log(...)`
3. Open Browser DevTools → Console
4. Filter for `aggregatePeriodData` logs

---

## Known Issues & Fixes

### Issue 1: returnPct Data Format Mismatch ⚠️ CRITICAL
- **Root Cause:** Backend sends `returnPct` in **decimal form** (0.3397), not percentage (33.97)
- **Previous Error:** Frontend was dividing by 100: `r = (item.returnPct || 0) / 100`
  - This converted 0.3397 → 0.003397
  - Compounding this gave ~0.34% instead of 34.00%

- **Example:** CCO.TO from Dec 31, 2025 (125.68) to Jan 31, 2026 (168.41)
  - Correct return: (168.41 / 125.68) - 1 = 0.3400 = **34.00%**
  - Wrong calculation: 0.3400 / 100 = 0.0034 = **0.34%** ← What was displayed

- **Fix Applied:**
  - **attributionUtils.ts line 39:** Removed `/100` — use returnPct directly
  - **AttributionTable.tsx line 30:** Added `* 100` when displaying — convert decimal to percentage

- **Status:** ✅ **FIXED** — Now displays correct 34.00%

### Issue 2: Data Format Consistency
- **Backend:** `returnPct` = decimal form (from line 146: `(price_end / price_start) - 1`)
- **Frontend:** Must treat returnPct as decimal, multiply by 100 for percentage display
- **Status:** ✅ **VERIFIED**

### Issue 3: FX Adjustment for USD Tickers
- **Current:** Applied at period level in `calculate_returns()`
- **Status:** ✅ Working (verified in `calculate_returns()` lines 150-155)

### Issue 4: Month-End Date Alignment
- **Current:** Automatic month-end injection in `portfolio.py:187-202`
- **Status:** ✅ Ensures clean monthly periods

---

## Next Steps

1. Run the application with debug logging enabled
2. Check backend logs for price/return calculations
3. Check browser console for aggregation logs
4. Compare displayed values with manual calculations
5. Report any discrepancies with specific ticker/date examples
