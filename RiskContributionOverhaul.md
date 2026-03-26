# Plan: Risk Contribution Tab Overhaul

## Goal
Elevate the Risk Contribution tab from a basic MCTR table into a full risk intelligence dashboard — adding a correlation matrix, return-vs-risk quadrant, tail risk metrics (VaR/CVaR), and a portfolio treemap.

## Current State (what already exists)
- 4 KPI cards: Portfolio Vol, Diversification Ratio, Effective Bets, Top-3 Concentration
- Bar chart: Risk % vs Weight (absolute / ratio toggle, expand modal for >10 positions)
- Scatter plot: Weight vs Risk contribution (diagonal "fair share" line)
- Sector Risk Decomposition bar chart
- Sortable RiskTable with: Weight, Vol, Beta, MCTR, Risk %, Risk-Adj Return columns
- Actual / Historical position mode toggle

## Progress

| Sub-feature | Status | Notes |
|-------------|--------|-------|
| **A: Correlation Matrix** | DONE | Backend + frontend implemented |
| **B: Return vs Risk Quadrant** | DONE | Toggle between Weight vs Risk (fair-share line) and Return vs Risk (quadrant) |
| **C: Tail Risk KPIs (VaR/CVaR)** | DONE | VaR 95%, CVaR 95% KPI cards + backend |
| **D: Portfolio Beta KPI** | DONE | Weighted-average beta KPI card + backend |
| **E: Portfolio Treemap** | SCRAPPED | Bar chart restored instead — cleaner for this layout |

### Bug Fixes Applied
- Fixed avgVol display in sector tooltip (was `× 100` on already-percentage values)
- Fixed position weight display in sector tooltip key drivers (same issue)
- Removed orphaned `SectorRiskChart.tsx` (dead code)

---

## Sub-feature B: Return vs Risk Quadrant Chart

**Where:** Replace the current scatter plot (Weight vs Risk) with a tabbed pair: **Weight vs Risk** (existing) and **Return vs Risk** (new).

**No backend changes needed** — all data already in `positions[].annualizedReturn` and `positions[].pctOfTotalRisk`.

**Frontend Changes — `client/views/risk/RiskCharts.tsx`**
- Add state: `const [scatterMode, setScatterMode] = useState<'weight' | 'return'>('weight')`
- Add toggle buttons to the scatter chart header (same pill toggle style as barChartMode)
- **Return vs Risk mode:**
  - X-axis: `pctOfTotalRisk` (risk contribution %)
  - Y-axis: `annualizedReturn` (%)
  - Quadrant lines: `ReferenceLine x={portfolioAvgRisk}` and `ReferenceLine y={0}`
  - Quadrant labels (small text, corner of each quadrant):
    - Top-left: "Efficient" (green text)
    - Top-right: "High Cost" (amber)
    - Bottom-left: "Deadweight" (blue)
    - Bottom-right: "Drag" (red)
  - Cell color: same `entry.y > 0 ? '#22c55e' : '#ef4444'` pattern
  - Pass `portfolioAvgRisk` from parent = `100 / positions.length` (equal-weight reference)

---

## Sub-feature C: Tail Risk KPIs (VaR / CVaR)

**Where:** Extend the 4-card KPI row to 6 cards.

**Backend Changes — `server/routes/risk.py`**
- Inside `compute_risk_contribution()`, after computing `port_vol`, add:
  ```python
  port_returns_series = (returns_df[ticker_list] * w).sum(axis=1).dropna()
  var_95 = float(np.percentile(port_returns_series, 5)) * 100          # daily VaR 95%
  var_99 = float(np.percentile(port_returns_series, 1)) * 100          # daily VaR 99%
  cvar_95 = float(port_returns_series[port_returns_series <= np.percentile(port_returns_series, 5)].mean()) * 100
  ```
- Add to return dict: `"var95": round(var_95, 2)`, `"var99": round(var_99, 2)`, `"cvar95": round(cvar_95, 2)`
- These are daily figures; show as daily (cleaner for interpretation)

**Frontend Changes — `client/types.ts`**
- Extend `RiskContributionResponse`: `var95?: number; var99?: number; cvar95?: number;`

**Frontend Changes — `client/views/risk/RiskContributionView.tsx`**
- Change KPI grid from `grid-cols-4` to `grid-cols-3 lg:grid-cols-6`
- Proposed final 6-card layout:
  1. Portfolio Volatility (existing)
  2. Portfolio Beta *(new — sub-feature D)*
  3. Diversification Ratio (existing)
  4. Effective Bets (existing)
  5. VaR 95% (daily) *(new)*
  6. CVaR 95% (daily) *(new)*

---

## Sub-feature D: Portfolio Beta KPI

**Where:** New KPI card alongside existing 4; becomes part of the 6-card row.

**Backend Changes — `server/routes/risk.py`**
- Add explicit weighted-average beta:
  ```python
  portfolio_beta = float(np.dot(w, betas))
  ```
  where `betas` already exists. Add `"portfolioBeta": round(portfolio_beta, 2)` to return dict.

**Frontend Changes — `client/types.ts`**
- Extend `RiskContributionResponse`: `portfolioBeta?: number;`

**Frontend Changes — `client/views/risk/RiskContributionView.tsx`**
- New `<MetricCard>` for Beta:
  ```tsx
  <MetricCard title="Portfolio Beta" value={data ? `${data.portfolioBeta.toFixed(2)}` : '—'}
    subtitle="vs blended benchmark" isPositive={data ? Math.abs(data.portfolioBeta - 1) < 0.2 : undefined}
    icon={Activity} loading={loading} />
  ```

---

## Implementation Order

| Step | Sub-feature | Effort | Backend? | Frontend? |
|------|-------------|--------|----------|-----------|
| 1 | **D: Portfolio Beta KPI** | XS | 1 line | 1 card |
| 2 | **C: Tail Risk KPIs (VaR/CVaR)** | Small | ~10 lines | 2 cards + type |
| 3 | **B: Return vs Risk Quadrant** | Small | None | Toggle + chart mode |
