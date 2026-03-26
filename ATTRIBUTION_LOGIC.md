# Portfolio Attribution — Computation Logic

This document defines the rules and formulas for computing portfolio returns, contributions, and their aggregations. These rules must be respected regardless of data source or output format.

---

## 1. Definitions

| Term | Symbol | Description |
|---|---|---|
| Sub-period | `t` | A time interval where all weights are constant (delimited by rebalancing dates) |
| Weight | `w_t` | Fraction of portfolio allocated to a holding at the start of sub-period t (decimal, e.g. 0.015 = 1.5%) |
| Holding return | `r_t` | Return of an individual holding over sub-period t |
| FX return | `fx_t` | Return of the FX rate (e.g. USD/CAD) over sub-period t |
| Sub-period contribution | `c_t` | Contribution of a holding to portfolio return in sub-period t |

---

## 2. Holding Return

For each holding over a sub-period:

```
r_t = (price_end / price_start) - 1
```

### FX Adjustment

If the holding is denominated in a foreign currency, adjust:

```
r_t_adjusted = (1 + r_t) × (1 + fx_t) - 1
```

A holding does **NOT** need FX adjustment if:
- It is a mutual fund with NAV already in the local currency
- It is listed on a local exchange (e.g. `.TO` suffix for TSX in a CAD portfolio)

> [!IMPORTANT]
> FX adjustment must be applied **consistently** everywhere a return is computed — sub-period, monthly, quarterly, and YTD.

---

## 3. Sub-Period Contribution

For a single sub-period, contribution is simply:

```
c_t = w_t × r_t
```

This value is correct **in isolation** — it represents how many bps this holding added to the portfolio during sub-period t, measured relative to the portfolio value at the start of t.

---

## 4. Aggregating Contributions Across Sub-Periods

### The Rule

> [!CAUTION]
> **Never sum sub-period contributions arithmetically.** Each `c_t` is measured relative to a different portfolio base (which changes as the portfolio grows/shrinks). Arithmetic sum understates positive contributions and overstates negative ones.

### Forward-Compounded Contribution

When aggregating sub-period contributions over a span (month, quarter, YTD), use:

```
C = Σ_t [ w_t × r_t × Π_{s>t}(1 + r_s) ]
```

Expanded for 3 sub-periods:

```
C = w₁r₁(1+r₂)(1+r₃) + w₂r₂(1+r₃) + w₃r₃
```

The factor `Π_{s>t}(1 + r_s)` compounds each sub-period's contribution forward to the end of the aggregation window, rescaling all contributions to the **same base**.

### Implementation

```python
# sub_data: list of (weight, return) tuples in chronological order
contribution = 0.0
for t in range(len(sub_data)):
    w_t, r_t = sub_data[t]
    forward_factor = 1.0
    for s in range(t + 1, len(sub_data)):
        _, r_s = sub_data[s]
        forward_factor *= (1.0 + r_s)
    contribution += w_t * r_t * forward_factor
```

### Properties

| Scenario | Behaviour |
|---|---|
| Constant weight `w` | Exactly equals `w × geometric_return` where geometric_return = `Π(1+r_t) - 1` |
| Varying weights | Properly weights each sub-period by its allocation and compounds forward |
| Single sub-period | Reduces to `w × r` (no compounding needed) |

### Proof (constant weight)

```
w·r₁·(1+r₂)(1+r₃) + w·r₂·(1+r₃) + w·r₃
= w · [r₁(1+r₂)(1+r₃) + r₂(1+r₃) + r₃]
= w · [(1+r₁)(1+r₂)(1+r₃) - 1]
= w · monthly_return  ✓
```

### Intuition

If a holding returned 16% in week 1, those gains didn't sit idle — they grew through weeks 2, 3, and 4. The forward factor captures this compounding effect. Without it, you're treating each sub-period as if the portfolio reset to its original size, which understates the total contribution.

---

## 5. Monthly / Quarterly Return

For each holding, the return over a longer span (month, quarter) is computed **geometrically from prices**, not by summing sub-period returns:

```
monthly_return = (price_month_end / price_month_start) - 1
```

Then FX-adjusted if applicable. This is equivalent to the geometric chain:

```
monthly_return = Π_t (1 + r_t) - 1
```

---

## 6. YTD Return

Geometric chain of monthly returns:

```
ytd_return = Π_m (1 + monthly_return_m) - 1
```

---

## 7. YTD Contribution

Forward-compounded across **all sub-periods in the year**, using the same formula from §4.

Alternatively, the sum of monthly forward-compounded contributions (since each monthly contribution is already properly compounded within its month, and months are aggregated at the portfolio level).

---

## 8. Cash Holdings

- Return = `0.0` always
- Contribution = `0.0` always
- Weight is tracked for display / weight-sum validation only

---

## 9. Dead Weight / Zero Weight

A weight of `0.0` means the holding is non-existent for that period. Its contribution is zero. It should be treated equivalently to not being in the portfolio.

---

## 10. Summary of Aggregation Rules

| What | How |
|---|---|
| Returns across sub-periods | **Geometric**: `Π(1+r_t) - 1` |
| Contributions within a sub-period | **Arithmetic**: `w_t × r_t` |
| Contributions across sub-periods | **Forward-compounded**: `Σ[w_t × r_t × Π_{s>t}(1+r_s)]` |
| YTD return from monthly returns | **Geometric**: `Π(1+R_m) - 1` |
