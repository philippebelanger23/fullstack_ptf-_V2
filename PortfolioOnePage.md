# Plan: Portfolio Report View (Feature #9) — Revised

## Current State

`ReportView.tsx` exists and renders:
- **Header** — "PORTFOLIO REPORT" + date + Print button
- **KPI Strip** — 8 metrics (Total Return, Alpha, Sharpe, Sortino, Vol, Beta, Max DD, VaR 95%)
- **Bento Grid (3-col, 2-row)**:
  - LEFT (spans 2 rows): Performance chart (`UnifiedPerformancePanel`) with Absolute / Relative / Drawdowns toggle + period selector
  - TOP RIGHT: Benchmark Sector Deviation (`SectorDeviationCard`)
  - TOP RIGHT: Regional Sector Tilt (`SectorGeographyDeviationCard`)
  - BOTTOM RIGHT: **Empty panel** ← slot 1
  - BOTTOM RIGHT: **Empty panel** ← slot 2
- **Footer** — generated date + freshness badge + disclaimer

---

## Hero Features by Tab (Candidates for the Report)

### Tab: Overview (`DashboardView`)
| Feature | Component | Value |
|---------|-----------|-------|
| Portfolio composition KPIs | `KPICard` | Capital allocation, currency exposure, div yield, portfolio beta |
| Weight-over-time area chart | `PortfolioEvolutionChart` | Stacked area showing allocation drift across rebalance dates |
| Sector deviation vs benchmark | `SectorDeviationCard` | Horizontal bar: portfolio vs ACWI+TSX sector weights |
| Full holdings table | `PortfolioTable` | All positions, weight, sector, beta, div yield |
| Concentration pie | `ConcentrationPieChart` | Top-N holdings visual |

### Tab: Performance (`PerformanceView`)
| Feature | Component | Value |
|---------|-----------|-------|
| Backtest KPIs | `PerformanceKPIs` | Sharpe, Sortino, Alpha, Calmar, Max DD, Volatility |
| Portfolio vs benchmark chart | `UnifiedPerformancePanel` | Absolute / Relative / Drawdown modes |
| Relative performance panel | `RelativePerformancePanel` | Rolling excess return, alpha chart |

### Tab: Attribution (`AttributionView`)
| Feature | Component | Value |
|---------|-----------|-------|
| Monthly/quarterly attribution tables | `AttributionTable` | Per-position contribution ranked by impact |
| Sector attribution charts | `SectorAttributionCharts` | Bar chart: allocation vs selection effect |
| Period aggregation | `aggregatePeriodData()` | YTD / custom period rollup |

### Tab: Risk (`RiskContributionView`)
| Feature | Component | Value |
|---------|-----------|-------|
| Risk KPIs | `RiskKPIs` | Portfolio Vol, Beta, Diversification Ratio, Effective Bets, VaR 95%, CVaR 95% |
| Risk contribution bar chart | `RiskBarChart` | Per-position % of total risk |
| Return vs Risk scatter | `ReturnRiskScatter` | Positions plotted by return vs vol — quadrant view |
| Risk treemap | `RiskTreemap` | Risk weight by position/sector, area-encoded |

### Tab: Correlation (`CorrelationView`)
| Feature | Component | Value |
|---------|-----------|-------|
| Correlation heatmap | `CorrelationHeatmap` | N×N matrix with diverging color scale |
| Diversification analysis | inline | Avg correlation, effective N, diversification score |

### Tab: Index Exposure (`IndexView`)
| Feature | Component | Value |
|---------|-----------|-------|
| Sector weights (Sunburst) | `SunburstChart` | Portfolio sector breakdown, reusable at any size |
| Geography vs benchmark | `SectorGeographyDeviationCard` | Regional tilt heatmap |

---

## Revised Layout Plan

The two empty bottom-right slots should be filled with the two most impactful missing pieces: **Risk Contribution breakdown** and **Top Holdings table**. This makes the report a true self-contained one-pager.

### Target Grid (3-col, 2-row bento)

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER: "PORTFOLIO REPORT" + date + benchmark + [Print]         │
├──────────────────────────────────────────────────────────────────┤
│  KPI STRIP: Return | Alpha | Sharpe | Sortino | Vol | Beta | MaxDD | VaR  │
├──────────────────────┬───────────────────┬───────────────────────┤
│  PERFORMANCE CHART   │ SECTOR DEVIATION  │ REGIONAL TILT         │
│  (spans 2 rows)      │ Portfolio vs BMK  │ Geo + Sector heat     │
│  Absolute/Rel/DD     ├───────────────────┼───────────────────────┤
│  + period selector   │ RISK CONTRIBUTION │ TOP 10 HOLDINGS       │
│                      │ Bar chart: top 8  │ Compact table         │
│                      │ pos by % risk     │ Ticker|Wt|Sector|Cntrb│
├──────────────────────┴───────────────────┴───────────────────────┤
│  FOOTER: date · freshness · disclaimer                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## File Changes Required

### 1. FILL: `client/views/ReportView.tsx` — Replace 2 empty panels

**Bottom-right slot 1 → Mini Risk Contribution Bar Chart**
- Reuse `RiskBarChart` or inline a compact Recharts `BarChart`
- Data: `riskData.positions` sorted by `riskContribution` desc, top 8
- Show ticker + % of total risk
- No tabs/toggles (just position view)

**Bottom-right slot 2 → Top 10 Holdings Table**
- Inline `<table>` (no PortfolioTable — too heavy)
- Columns: Ticker | Weight | Sector | Period Contribution | Risk %
- Already computed: `enrichedTop10` (has `periodContribution` + `riskPercent`)
- Compact: 10px font, tight row padding

### 2. OPTIONAL FUTURE SLOTS (if layout allows)

These are candidates if we ever expand to a 2-page report or scrollable in-app view:
- `ReturnRiskScatter` — positions in return/risk quadrant (very visual, high value)
- `SunburstChart` — sector sunburst at compact size (already available)
- Rolling alpha line from `RelativePerformancePanel`
- YTD attribution waterfall from `AttributionTable`

---

## Implementation Steps

1. **Fill bottom-left slot** — Add compact `RiskBarChart` (top 8 positions by risk %) into empty panel 1
2. **Fill bottom-right slot** — Add `enrichedTop10` inline table into empty panel 2
3. **Style pass** — Ensure all 4 right-column cards have consistent header/padding/font
4. **Print CSS** — Verify bento grid holds at landscape; fix any Recharts SVG collapse
5. **Test** — Load real portfolio → verify all 6 panels render → print preview → PDF

---

## What's Already Working (Don't Break)

- KPI strip with 8 metrics
- `UnifiedPerformancePanel` with view/period toggles
- `SectorDeviationCard` + `SectorGeographyDeviationCard`
- Print button + footer
- `enrichedTop10` derivation (already has risk % + period contribution)
- Data fetching: `fetchPortfolioBackcast` + `fetchRiskContribution` + `fetchIndexExposure` + `fetchSectors`

---

## Key Constraints

- **No new API calls** — all data already fetched (`riskData.positions` for risk bars, `enrichedTop10` for holdings)
- **Recharts in print**: Use fixed-height wrapper div with explicit `px` height, not `%`
- **RiskBarChart** accepts `data`, `loading`, `activeTab` props — set `activeTab='position'` and wrap in fixed container
- **Single page print target**: Keep bottom row cards under ~200px to fit landscape A4/Letter
