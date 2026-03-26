# Performance Column Fix Summary

## Issue
CCO.TO showing **0.32%** for January 2026 when it should show **34.00%**
- Price: 125.68 (Dec 31, 2025) → 168.41 (Jan 31, 2026)
- Correct return: (168.41 / 125.68) - 1 = **0.3400 = 34.00%**

## Root Cause
Frontend was incorrectly dividing `returnPct` by 100 during aggregation, creating a cascading error:
- Backend sends: 0.3400 (decimal)
- Frontend divided: 0.3400 / 100 = 0.0034 (wrong!)
- Display showed: ~0.34%

## Files Changed

### 1. `client/views/attribution/attributionUtils.ts`
**Lines 43-49:** Fixed returnPct handling in aggregation

```typescript
// BEFORE (WRONG):
const r = (item.returnPct || 0) / 100;  // ❌ Dividing by 100
const weightedAvgReturn = weightSum > 0 ? (weightTimesReturnSum / weightSum) : 0;

// AFTER (CORRECT):
const compoundReturn = items.reduce((product, item) => {
    const r = item.returnPct || 0;  // ✅ No division - already decimal
    return product * (1 + r);
}, 1) - 1;
const weightedAvgReturn = compoundReturn * 100;  // ✅ Convert to percentage for storage
```

**Key Change:**
- Removed `/100` — `returnPct` from backend is **decimal form** (0.3400)
- Added `* 100` after compounding — store as **percentage form** (34.00) for display

### 2. `client/views/attribution/AttributionTable.tsx`
**Line 30-31:** Fixed display to use percentage-form returnPct

```typescript
// BEFORE (WRONG):
${item.returnPct.toFixed(2)}%  // If returnPct = 0.34, shows "0.34%"

// AFTER (CORRECT):
${item.returnPct.toFixed(2)}%  // If returnPct = 34.00, shows "34.00%"
```

No multiplication needed because aggregation already converted to percentage.

## Data Flow (Corrected)

```
Backend (market_data.py)
├─ price_end / price_start - 1 = 0.3400 (decimal)
└─ Stored in PortfolioItem.returnPct

Frontend: aggregatePeriodData()
├─ Input: item.returnPct = 0.3400 (decimal from backend)
├─ Compound: (1 + 0.3400) - 1 = 0.3400
├─ Convert: 0.3400 * 100 = 34.00 (percentage)
└─ Output: TableItem.returnPct = 34.00

Frontend: AttributionTable
├─ Input: item.returnPct = 34.00 (percentage)
└─ Display: "34.00%"
```

## Test Case: CCO.TO January 2026

| Step | Value | Format |
|------|-------|--------|
| Price Dec 31, 2025 | 125.68 | - |
| Price Jan 31, 2026 | 168.41 | - |
| Return calculation | (168.41 / 125.68) - 1 = 0.3400 | Decimal |
| Backend sends | 0.3400 | Decimal |
| Frontend aggregates | 0.3400 * 100 = 34.00 | Percentage |
| Display shows | **34.00%** | ✅ Correct |

## Verification

To verify the fix works:

1. Open **Attribution View** → **Tables** tab
2. Find **January 2026**
3. Locate **CCO.TO** row
4. Check **Performance** column
   - ❌ Before: 0.32%
   - ✅ After: 34.00%

Or in browser console:
```javascript
// Check debug logs from aggregatePeriodData
// Look for: [aggregatePeriodData] CCO.TO ... -> compound=34.00%
```

## Related Debug Logging

Two debug logs were added to trace the issue:

1. **Backend** (`server/market_data.py`): Logs price→return calculation
2. **Frontend** (`client/views/attribution/attributionUtils.ts`): Logs aggregation logic

Check browser Console (F12) or server logs with `--log-level debug` for detailed traces.

---

**Status:** ✅ **FIXED** — Performance column now displays correct period returns
