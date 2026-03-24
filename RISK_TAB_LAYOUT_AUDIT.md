# Risk Contribution Tab — Layout & Panel Relevance Audit

_Audited: 2026-03-23_

---

## Current Layout

```
┌─────────────────────────────┬─────────────────────────────┐
│  RiskBarChart               │  ReturnRiskScatter          │
│  (positions / sectors)      │  (return vs risk quadrant)  │
│  50%                        │  50%                        │
├──────────────────────────────────────┬──────────────────────┤
│  RiskTreemap                         │  CorrelationHeatmap  │
│  col-span-3  (~60%)                  │  col-span-2 (~40%)   │
└──────────────────────────────────────┴──────────────────────┘
│  RiskTable  (full width)                                    │
└─────────────────────────────────────────────────────────────┘
```

**File:** `client/views/risk/RiskContributionView.tsx`

---

## 1. Do Panels Physically Overlap?

**No.** All panels live inside CSS grid containers with `gap-6`. No `position: absolute`, z-index stacking, or overflow collisions exist. Panels are fully separated at all viewport sizes.

---

## 2. What Does Each Panel Encode?

| Panel | Dimensions | Primary Question Answered |
|---|---|---|
| **Bar Chart — Sectors view** | Risk % vs Weight % per sector | Which sectors are over/under-contributing to risk vs allocation? |
| **Bar Chart — Positions view** | Risk % vs Weight % per ticker (absolute or ratio) | Which individual positions are disproportionate risk contributors? |
| **Return vs Risk Scatter** | X = Risk %, Y = Return %, bubble size = Weight | Is each position's risk cost justified by its return? |
| **Risk Treemap** | Size = Risk %, Color = Risk-Adj Return | Visual map of where risk lives, and whether it earns its keep |
| **Correlation Matrix** | Pairwise return correlations (top 15 by risk) | Are positions truly diversified or highly correlated? |
| **Risk Table** | All metrics per position (Vol, Beta, MCTR, Risk %, Return, Risk-Adj) | Deep-dive reference for any position |

---

## 3. Panel Overlap / Redundancy Analysis

### Scatter ↔ Treemap — HIGH overlap (most redundant pair)

Both panels answer the same question: **"Is this position's risk-taking justified by its return?"**

- **Scatter** encodes: X = Risk %, Y = Annualized Return → four quadrants (Efficient / High Cost / Deadweight / Drag)
- **Treemap** encodes: Size = Risk %, Color = Risk-Adjusted Return (Return / Vol) → red-to-green gradient

The metric differs slightly (raw annualized return vs risk-adjusted return), but the actionable conclusion is identical. A position in the "Drag" quadrant of the scatter (high risk, low return) will almost always be red in the treemap. A user reading both charts back-to-back will not learn new information.

**Verdict: ⚠️ Redundant — candidate for tab-combining**

---

### Bar Chart (Positions view) ↔ Treemap — MODERATE overlap

Both communicate "which positions carry the most risk":
- Bar chart: explicit numeric bars for Risk % and Weight % side by side
- Treemap: visual area proportional to Risk %

They differ in that the bar chart adds the exact weight comparison, while the treemap adds return-quality color. Neither fully replaces the other, but they share the "risk concentration" message.

**Verdict: ⚠️ Partial overlap — acceptable given different interaction model (precision vs. visual gestalt)**

---

### Bar Chart (Sectors view) ↔ anything else — NO overlap

Sector aggregation is unique to this panel. It is the only view showing risk vs weight at the sector level, which is essential for portfolio construction decisions.

**Verdict: ✅ Unique — keep**

---

### Correlation Matrix ↔ anything else — NO overlap

The only panel showing inter-position relationships. Not derivable from any other chart. Also the only panel that directly flags concentration/diversification at the position-pair level.

**Verdict: ✅ Unique — keep**

---

## 4. The Real Problem: Correlation Heatmap Width Constraint

The heatmap uses a **fixed `CELL_SIZE = 38`** (`CorrelationHeatmap.tsx:10`).
With 15 tickers shown:

```
15 × (38 + 2px margin) + 72px label column = ~672px minimum
```

At `col-span-2` in a `lg:grid-cols-5` grid, on a typical 1440px viewport minus padding:

```
(1376px × 2/5) ≈ 550px  →  ~122px short → triggers overflow-x-auto scroll
```

The heatmap works, but it silently scrolls inside its card and the cells are cramped. This is the most concrete layout defect in the tab.

---

## 5. Layout Options

### Option A — 80/20 Split (Treemap dominant)

Change bottom row from `col-span-3 / col-span-2` to `col-span-4 / col-span-1`:
- Treemap gets ~80%, fills well as a loose visual
- **Worsens the correlation problem** — heatmap gets ~275px. At `CELL_SIZE = 38`, only ~6 tickers fit without scroll. Cell size would need to drop to ~14px, which is unreadable.
- **Only viable if cell size is made dynamic** (computed from container width at runtime)

### Option B — Full-width Tab Switcher *(recommended)*

Replace bottom row with a single full-width panel with a `[Treemap] [Correlation]` tab control:
- Both panels get 100% width — 15 tickers × 40px = 600px, comfortable in any viewport
- Eliminates the scroll/overflow problem entirely
- Clean UX: Treemap and Correlation address orthogonal questions (composition vs. relationships), tabbing is natural
- Resolves the Scatter ↔ Treemap redundancy if Scatter is simultaneously merged into the Treemap tab (see Option B+)

### Option B+ — Recommended combined approach

```
Row 1:  Bar Chart (50%)  |  [Tab: Treemap / Scatter / Correlation] (50%)
Row 2:  Risk Table (full width)
```

- Bar Chart stays — unique sector analysis, no replacement
- Right panel becomes a 3-tab switcher: **Treemap** (composition) | **Scatter** (efficiency) | **Correlation** (relationships)
- Reduces from 4 chart panels to 2 chart areas
- Each tab gets full 50% width — correlation heatmap fits at 38px cells up to ~17 tickers without scroll on 1440px

### Option C — Move Correlation to its own row *(minimal change)*

```
Row 1: Bar Chart | Scatter       (50/50)
Row 2: Treemap                   (full width)
Row 3: Correlation               (full width)
```
Simplest code change. Solves the width problem. Increases page scroll significantly. Does not address the Scatter ↔ Treemap redundancy.

### Option D — Dynamic cell size

Keep current layout, compute `CELL_SIZE` from container width via `ResizeObserver`. Most complex, preserves existing visual structure. Does not address the analytical redundancy.

---

## 6. Summary

| Finding | Severity | Verdict |
|---|---|---|
| Physical panel overlap | None | ✅ Clean |
| Scatter ↔ Treemap data redundancy | Medium | ⚠️ Both answer "efficiency of risk-taking" — consider tabbing |
| Bar (Positions) ↔ Treemap partial redundancy | Low | Acceptable (different interaction) |
| Correlation heatmap overflows at 40% width | High | ❌ Fix needed |
| 80/20 split for Treemap/Correlation | Note | Worsens overflow unless cell size is made dynamic |
| Bar Chart (Sectors) — unique | — | ✅ Keep as-is |
| Correlation Matrix — unique | — | ✅ Keep, needs more space |

---

## 7. Recommended Action Plan

1. **Merge Scatter into a tab on the Treemap card** — removes the only truly redundant panel pair
2. **Give Correlation Matrix more horizontal space** — either full-width row, tab switcher, or dynamic cell sizing
3. **80/20 split is not viable without dynamic cell sizing** — pair with Option D if choosing this path
