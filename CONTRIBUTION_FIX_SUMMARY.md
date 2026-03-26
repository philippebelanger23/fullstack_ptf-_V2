# Contribution Column Fix Summary

## Issue
Contribution values were displaying incorrectly due to **data format mismatch**.

### Example: CCO.TO January 2026
- Weight: 5%
- Return: 34% (newly fixed)
- Contribution calculation: 5% * 34% = 1.7%
- **Should display:** 170 bps
- **Was displaying:** 2 bps ❌

## Root Cause

**Decimal vs Percentage Format Mismatch:**

1. **Backend** sends contribution in **decimal form**: `0.017` (which represents 1.7%)
   - Formula: weight (0.05 decimal) × return (0.34 decimal) = 0.017 (decimal)

2. **Frontend formatter** `formatBps()` expects **percentage form**: `1.7`
   - Code: `Math.round(val * 100)`
   - If val = 0.017: `0.017 * 100 = 1.7` → rounds to **2 bps** ❌
   - If val = 1.7: `1.7 * 100 = 170` → **170 bps** ✓

3. **Display mismatch:**
   - formatBps receives: 0.017 (decimal)
   - formatBps calculates: 0.017 * 100 = 2
   - Should calculate: 0.017 * 10000 = 170 bps

## Solution

Convert contribution from **decimal form to percentage form** in `aggregatePeriodData()`, immediately after summation.

### Files Changed

#### 1. `client/views/attribution/attributionUtils.ts` (Lines 32-37)

```typescript
// BEFORE (WRONG):
const totalContrib = items.reduce((sum, item) => sum + (item.contribution || 0), 0);
// Result: 0.017 (decimal)

// AFTER (CORRECT):
const totalContribDecimal = items.reduce((sum, item) => sum + (item.contribution || 0), 0);
const totalContrib = totalContribDecimal * 100; // Convert to percentage form
// Result: 1.7 (percentage)
```

#### 2. `client/views/attribution/AttributionTable.tsx` (Line 21-22)

Updated the "Others" return calculation to use percentage-form contributions:

```typescript
// BEFORE (expected decimal form):
const othersReturn = residualOtherWeight > 0.001 ? (othersSum.contribution * 100) / residualOtherWeight : 0;

// AFTER (now uses percentage form):
const othersReturn = residualOtherWeight > 0.001 ? othersSum.contribution / residualOtherWeight : 0;
```

## Data Format Flow (Corrected)

```
Backend (market_data.py)
├─ weight = 0.05 (decimal)
├─ return = 0.34 (decimal)
└─ contribution = 0.05 * 0.34 = 0.017 (decimal)

Frontend: aggregatePeriodData()
├─ Input: item.contribution = 0.017 (decimal)
├─ Sum: totalContribDecimal = 0.017
├─ Convert: 0.017 * 100 = 1.7 (percentage form)
└─ Output: totalContrib = 1.7

Frontend: formatBps()
├─ Input: contribution = 1.7 (percentage form)
├─ Calculate: 1.7 * 100 = 170
└─ Display: "170 bps" ✓ CORRECT
```

## Test Case: CCO.TO January 2026

| Component | Value | Format | Display |
|-----------|-------|--------|---------|
| Weight | 0.05 | Decimal (5%) | 5.00% |
| Return | 0.34 | Decimal (34%) | 34.00% |
| Contribution (backend) | 0.017 | Decimal | - |
| Contribution (aggregated) | 1.7 | Percentage | formatBps(1.7) = 170 bps |
| **Expected Display** | - | - | **170 bps** ✓ |
| **Previous Display** | - | - | **2 bps** ❌ |

## Verification

To verify the fix works:

1. Open **Attribution View** → **Tables** tab
2. Find **January 2026** → **CCO.TO** row
3. Check **Contrib. (bps)** column
   - ❌ Before: 2 bps
   - ✅ After: 170 bps (approximately, depending on actual weight)

Or in browser console:
```javascript
// Check debug logs from aggregatePeriodData
// Look for: [aggregatePeriodData] CCO.TO ... totalContrib=1.70% (percentage form)
```

## Related Changes

**Performance Fix** (already applied):
- returnPct now in percentage form: 34.00 (not 0.34)
- formatBps receives both values in percentage form now ✓

**Data Consistency:**
- Both returnPct and contribution are now in **percentage form**
- formatBps consistently multiplies by 100 for both
- Display shows correct bps values

---

**Status:** ✅ **FIXED** — Contribution column now displays correct basis points
