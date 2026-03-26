# CCO.TO January 2026 - Data Audit Instructions

## Objective
Verify actual weight and contribution values for CCO.TO in January 2026 to identify if the issue is:
1. Weight not being fetched correctly from data import
2. Contribution formula calculation error
3. Display/formatting error

---

## Step 1: Start Backend with Debug Logging

```bash
cd /path/to/fullstack-ptf-V2
uvicorn main:app --log-level info
```

Watch for logs starting with `AUDIT CCO.TO` - these will show the raw values.

---

## Step 2: Open App and Navigate to Attribution View

1. Open http://localhost:5173 (or your dev server)
2. Go to **Attribution** tab → **Tables** view
3. Select **January 2026** period

---

## Step 3: Check Backend Logs

Look for output like:
```
AUDIT CCO.TO Period 0 (2025-12-31 to 2026-01-31)
  weight_raw=0.015000 weight_pct=1.50%
  return_raw=0.340000 return_pct=34.00%
  contribution_raw=0.005100 contribution_pct=0.51%
  contribution_bps=51.0 (for formatBps which does val*100)
```

**Copy the exact values shown.**

---

## Step 4: Check Browser Console Logs

Open DevTools (F12) → Console, look for:
```
[aggregatePeriodData] RAW DATA for CCO.TO:
  Item 0: date=2026-01-31 weight=0.015 returnPct=0.34 contribution=0.0051

[aggregatePeriodData] AGGREGATED for CCO.TO:
  weight=0.015
  contribution=0.0051
  returnPct=34
  formatBps(contribution) would show: 1 (!)
```

**Copy these values.**

---

## Step 5: Check Visual Display

In the Attribution Table for January 2026, CCO.TO row:
- Weight column: **?** (what does it show?)
- Performance column: **?** (what does it show?)
- Contrib. (bps) column: **?** (what does it show?)

**Screenshot or write down the displayed values.**

---

## Step 6: Analyze the Mismatch

Using the actual data, calculate what SHOULD display:

```
Formula: contribution = weight * return
         0.015 * 0.34 = 0.0051

In basis points: 0.0051 * 10000 = 51 bps

formatBps logic: Math.round(0.0051 * 100) = Math.round(0.51) = 1 bps
```

**Questions to answer:**
1. What does backend show for weight? (Should be 0.015 decimal = 1.50%)
2. What does backend show for contribution? (Should be 0.0051 decimal = 51 bps when correct)
3. What does browser show for displayed contribution? (Currently showing what value?)
4. Is the "enormous value" closer to 51, 510, 5100, or something else?

---

## Expected Results

### Correct Data Flow:
```
Backend sends:
  weight = 0.015 (decimal)
  return = 0.34 (decimal)
  contribution = 0.0051 (decimal)

Frontend displays:
  weight = 1.50%
  return = 34.00%
  contribution = 51 bps
```

### Actual Results:
```
Backend sends:
  weight = _______
  return = _______
  contribution = _______

Frontend displays:
  weight = _______
  return = _______
  contribution = _______ (WRONG - showing "enormous values")
```

---

## Possible Issues

### Scenario 1: Weight is correct, contribution formula is wrong
```
If contribution displayed = 5100 (instead of 51)
→ Means contribution is being multiplied by 100 extra times
→ Check if there's double conversion happening
```

### Scenario 2: Weight is not being fetched
```
If weight doesn't match 1.50%
→ Issue is in portfolio.py weight parsing or weights_dict population
→ Check data import logic
```

### Scenario 3: Return calculation is wrong
```
If return doesn't match 34.00%
→ But we already fixed this - should be 34%
→ Check if there are multiple fixes conflicting
```

---

## Report Template

Please provide:

```
BACKEND LOGS:
weight_raw = ___
weight_pct = ___
return_raw = ___
return_pct = ___
contribution_raw = ___
contribution_pct = ___
contribution_bps = ___

BROWSER LOGS:
Raw data weight = ___
Raw data contribution = ___
Aggregated contribution = ___
formatBps would show = ___

VISUAL DISPLAY:
Weight column shows: ___
Performance column shows: ___
Contrib (bps) column shows: ___

ISSUE IDENTIFIED:
[ ] Weight not fetched correctly
[ ] Contribution formula wrong
[ ] Double conversion/multiplication
[ ] Other: ___________
```

---

**Once you provide these values, I can identify and fix the exact issue.**
