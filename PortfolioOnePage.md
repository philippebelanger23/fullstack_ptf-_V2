# Plan: Portfolio One-Pager / Report View (Feature #9)

## Context

The "Portfolio Deep Dive" tab (`ViewState.ANALYSIS`) is currently disabled in the sidebar. It renders an AI-generated investment memo via Gemini API (`AnalysisView.tsx`). We want to **replace it** with a data-driven, printable one-pager that assembles the best metrics and charts from all other tabs into a professional portfolio fact sheet — viewable in-app and printable to PDF via `window.print()`.

**Why this approach:** All data already exists across the app's API endpoints. No new backend work needed. The existing print CSS infrastructure (landscape layout, `print-hide` class, color preservation) provides a foundation to build on.

---

## Layout: "Wall Street Fact Sheet" (dense, institutional)

The existing design language (wallstreet-* theme, font-mono, uppercase tracking) is already institutional. A dense fact sheet fits naturally.

### Structure (single landscape page when printed)

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER: "PORTFOLIO REPORT" + date + benchmark + [Print] button  │
├──────────────────────────────────────────────────────────────────┤
│  KPI STRIP: 8 compact metrics in a row                           │
│  Return | Alpha | Sharpe | Sortino | Vol | Beta | MaxDD | VaR95  │
├────────────────────────────┬─────────────────────────────────────┤
│  PERFORMANCE CHART         │  SECTOR ALLOCATION                  │
│  Portfolio vs Benchmark    │  SunburstChart (compact)             │
│  (LineChart, ~200px)       │  (~180px)                            │
├────────────────────────────┼─────────────────────────────────────┤
│  TOP 10 HOLDINGS TABLE     │  RISK SUMMARY                       │
│  Ticker|Name|Weight|Sector │  Top 5 risk contributors             │
│  (compact 10-row table)    │  + portfolio VaR/CVaR                │
├────────────────────────────┴─────────────────────────────────────┤
│  FOOTER: Generated date | Data freshness | Disclaimer            │
└──────────────────────────────────────────────────────────────────┘
```

---

## File Changes

### 1. NEW: `client/views/ReportView.tsx` (~300 lines)

The main component. Contains:

- **Data fetching** — parallel `Promise.all` of `fetchPortfolioBackcast` + `fetchRiskContribution` (same pattern as PerformanceView/RiskContributionView which use `loadPortfolioConfig` + `convertConfigToItems`)
- **CompactMetric** — tiny inline component (label + value + color), replaces MetricCard for density
- **MiniHoldingsTable** — plain `<table>`, top 10 by weight from `data` prop, no sorting/pagination
- **MiniRiskTable** — plain `<table>`, top 5 by `pctOfTotalRisk` from risk response
- **Performance LineChart** — simple Recharts `LineChart` (portfolio vs benchmark), no toolbar/selectors
- **SunburstChart** — reused directly at compact size (it accepts width/height)
- **Print button** — calls `window.print()`, hidden in print via `print-hide` class
- **Loading state** — skeleton/spinner while fetching

**Props interface:**
```ts
interface ReportViewProps {
  data: PortfolioItem[];
  customSectors?: Record<string, Record<string, number>>;
  assetGeo?: Record<string, string>;
}
```

### 2. MODIFY: `client/components/Sidebar.tsx` (line 88-91)

Re-enable the ANALYSIS tab:
```tsx
// FROM:
<div className={navItemClass(ViewState.ANALYSIS, true)} title="Module currently disabled">
  <FileText size={20} />
  <span className="font-medium">Portfolio Deep Dive</span>
</div>

// TO:
<div onClick={() => hasData && !isLocked && setView(ViewState.ANALYSIS)} className={navItemClass(ViewState.ANALYSIS, !hasData || isLocked)}>
  <FileText size={20} />
  <span className="font-medium">Portfolio Report</span>
</div>
```

Move it to a better position — after Relative Performance, before the disabled Correlation Matrix.

### 3. MODIFY: `client/App.tsx` (lines 5, 255-257)

- Replace import: `AnalysisView` → `ReportView`
- Update render:
```tsx
{visited.has(ViewState.ANALYSIS) && viewPane(ViewState.ANALYSIS,
  <ReportView data={portfolioData} customSectors={customSectors} assetGeo={assetGeo} />
)}
```

### 4. MODIFY: `client/index.css` (after line 198)

Add report-specific print overrides:
- `.report-view` → white background, dark text (overrides dark theme for print)
- `.report-kpi-strip` → forced 8-column grid
- `.report-chart-container` → fixed height so Recharts SVG doesn't collapse
- `.report-print-btn` → hidden in print
- Card backgrounds → white with light border (override wallstreet-800)

### 5. DELETE (optional): `client/views/AnalysisView.tsx` + `client/services/geminiService.ts`

Dead code after replacement. Can clean up or leave.

---

## Components: Reuse vs New

| Component | Decision | Reason |
|-----------|----------|--------|
| `SunburstChart` | **Reuse directly** | Accepts width/height props, renders at any size |
| Recharts `LineChart` | **Use directly** | Simple chart, no wrapper needed |
| `formatPct`, `formatPercent`, `formatNum` | **Reuse** | From `client/utils/formatters.ts` |
| `useThemeColors` | **Reuse** | For chart colors in dark/light mode |
| `PortfolioTable` | **Skip** | Too heavy (sorting, pagination, column toggles) |
| `MetricCard` / `KPICard` | **Skip** | Too tall (icons, tooltips, sparklines waste space) |
| `RiskBarChart` | **Skip** | Interactive with tabs/toggles |

---

## Data Flow

```
App.tsx
  ├── portfolioData (PortfolioItem[]) ──→ ReportView.data
  ├── customSectors ──→ ReportView.customSectors
  └── assetGeo ──→ ReportView.assetGeo

ReportView (internal useEffect):
  ├── loadPortfolioConfig() + convertConfigToItems()
  ├── fetchPortfolioBackcast(items) ──→ backcastData (metrics + series)
  └── fetchRiskContribution(latestItems) ──→ riskData (positions, sectorRisk, VaR)
```

---

## Implementation Steps

1. **Create `ReportView.tsx`** — scaffold with loading state, data fetching, header + KPI strip
2. **Wire into `App.tsx`** — replace AnalysisView import and render
3. **Re-enable in `Sidebar.tsx`** — enable tab, rename to "Portfolio Report", reposition
4. **Add performance chart** — LineChart with portfolio vs benchmark from backcast series
5. **Add sector sunburst** — reuse SunburstChart at compact size with data from portfolioData
6. **Add holdings + risk tables** — compact tables from portfolioData and riskData
7. **Add print CSS** — report-specific overrides in index.css
8. **Test print output** — verify landscape single-page fit, adjust font sizes/heights
9. **Clean up** — remove AnalysisView.tsx and geminiService.ts

---

## Key Considerations

- **Recharts in print**: SVG prints well, but `ResponsiveContainer` needs explicit parent height or collapses to 0. Use fixed-height wrappers with `!important` in print CSS.
- **Dark→light print**: wallstreet-800/900 backgrounds become white in print. Scoped to `.report-view` to avoid affecting other print styles.
- **Single-page fit**: Landscape 11x8.5" with 0.25" margins = ~10.5x8" usable. KPI strip + header ~1.5", two-column content ~5.5", footer ~0.5". Tight but achievable with 9-10px table fonts and 180-200px chart heights.
- **No new backend**: All data from existing endpoints (`/portfolio-backcast`, `/risk-contribution`).

---

## Verification

1. Start backend: `cd server && python main.py`
2. Start frontend: `cd client && npm run dev`
3. Load portfolio from Upload view
4. Navigate to "Portfolio Report" tab — verify all sections render with real data
5. Toggle dark/light mode — verify both look correct
6. Click Print button → browser print preview → verify single landscape page
7. Save as PDF → verify output quality
8. Check console for errors
