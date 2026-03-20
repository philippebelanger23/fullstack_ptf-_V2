# Master Plan: Portfolio Analytics Platform Improvements

## Context
The app is a full-stack portfolio analytics platform (React 19 + FastAPI) for a Canadian investor with cross-border holdings. It already features return attribution, risk decomposition, benchmark comparison, and FX adjustment. This master plan covers **10 selected improvements** to extract more insights and improve visuals. Each feature is designed as a standalone session.

---

## Feature 1: Monthly Performance Heatmap
**Goal:** Calendar-style grid showing monthly returns, color-coded by magnitude. Reveals seasonality and streaks.

### Where in the app
- **Location:** Inside the Performance view, as a new section BELOW the existing `<PerformanceCharts>` and ABOVE the bottom grid (Period Snapshot / Risk Interpretation tables)
- **Insertion point:** [PerformanceView.tsx:234](client/views/performance/PerformanceView.tsx#L234) — after `<PerformanceCharts ... />` closing tag (line 235), before `</div>` closing the main container

### Backend Changes
- **No new endpoint needed** — compute client-side from existing `data.series` (already contains daily `{date, portfolio, benchmark}` values)
- Client groups by `(year, month)`, compounds daily returns into monthly return

### Frontend Changes
- **New file:** `client/components/MonthlyHeatmap.tsx`
  - Grid: rows = years (2025, 2026), cols = Jan–Dec
  - Each cell: colored div (green shades for positive, red for negative, intensity = magnitude)
  - Tooltip on hover: exact return %, benchmark comparison for that month
  - Build using simple `<div>` grid with Tailwind classes — no Recharts needed
  - Props: `series: BackcastSeriesPoint[]`
- **Modify:** [PerformanceView.tsx](client/views/performance/PerformanceView.tsx)
  - Import `MonthlyHeatmap`
  - Add `<MonthlyHeatmap series={data.series} />` at line ~235
- **Reuse:** `formatPercent()` from [formatters.ts](client/utils/formatters.ts)

---

## Feature 2: Rolling Metrics Dashboard
**Goal:** Line charts showing rolling 30/60/90-day Sharpe, volatility, and beta over time.

### Where in the app
- **Location:** Inside the Performance view, as a new collapsible section BELOW the Monthly Heatmap (Feature 1), or directly below `<PerformanceCharts>` if heatmap not yet built
- **Insertion point:** Same area — [PerformanceView.tsx:235](client/views/performance/PerformanceView.tsx#L235) region

### Backend Changes
- **New endpoint:** `POST /rolling-metrics` in [risk.py](server/routes/risk.py) (after line 235, end of file)
  - Accepts same `BackcastRequest` model
  - Calls new `compute_rolling_metrics()` in [backcast_service.py](server/services/backcast_service.py)
  - Returns: `{windows: {30: [{date, sharpe, vol, beta}, ...], 60: [...], 90: [...]}}`
- **New function in** [backcast_service.py](server/services/backcast_service.py) (after `compute_backcast_metrics` ~line 220):
  ```python
  def compute_rolling_metrics(portfolio_returns, benchmark_returns, windows=[30, 60, 90]):
      # For each window, slide and compute sharpe/vol/beta at each date
  ```

### Frontend Changes
- **New file:** `client/components/RollingMetricsChart.tsx`
  - 3 Recharts `<LineChart>` panels (Sharpe, Volatility, Beta) stacked vertically
  - Window toggle buttons (30/60/90 day)
  - Portfolio line + benchmark reference dashed line
  - Reuse chart styling from [PerformanceCharts.tsx](client/views/performance/PerformanceCharts.tsx) (CartesianGrid, XAxis, YAxis, Tooltip patterns)
- **New API call in** [api.ts](client/services/api.ts): `fetchRollingMetrics(items)`
- **Modify:** [PerformanceView.tsx](client/views/performance/PerformanceView.tsx) — import and render below charts

---

## Feature 3: Drawdown Analysis Panel
**Goal:** Visual drawdown analysis — top 5 drawdown episodes, underwater chart, duration stats.

### Where in the app
- **Location:** Enhance the existing "Drawdowns" tab in PerformanceCharts. Currently the drawdowns `ChartView` (line 8 of [PerformanceCharts.tsx](client/views/performance/PerformanceCharts.tsx): `type ChartView = 'absolute' | 'relative' | 'drawdowns'`) shows a basic drawdown line chart. Enhance it with a detailed panel below.
- **Insertion point:** Inside [PerformanceCharts.tsx](client/views/performance/PerformanceCharts.tsx), after the main chart `<ResponsiveContainer>` block (line ~254), add a conditional section when `chartView === 'drawdowns'`
- **Also:** The drawdown data computation already exists at [PerformanceView.tsx:99-109](client/views/performance/PerformanceView.tsx#L99-L109) — extend this.

### Backend Changes
- **Extend** `compute_backcast_metrics()` in [backcast_service.py:114-220](server/services/backcast_service.py#L114-L220):
  - Add drawdown episode detection (already computes `drawdown` series at lines 148-151)
  - Add to return: `topDrawdowns: [{start, trough, recovery, depth, durationDays, recoveryDays}, ...]`
  - Add `drawdownSeries: [{date, drawdownPct}, ...]`

### Frontend Changes
- **New file:** `client/components/DrawdownAnalysis.tsx`
  - **Underwater chart:** Recharts `<AreaChart>` with drawdown % (always ≤ 0), filled red gradient
  - **Top drawdowns table:** columns: Rank, Start, Trough, Recovery, Depth %, Duration, Recovery Time
  - Props: `topDrawdowns`, `drawdownSeries`
- **Modify:** [PerformanceCharts.tsx](client/views/performance/PerformanceCharts.tsx)
  - Import `DrawdownAnalysis`
  - After the main chart div (line ~254), render `{chartView === 'drawdowns' && <DrawdownAnalysis ... />}`
- **Modify:** [types.ts](client/types.ts) — extend `BackcastResponse` with `topDrawdowns?` and `drawdownSeries?`

---

## Feature 7: Dark Mode Toggle
**Goal:** Toggle between light/dark themes using the existing CSS variable system.

### Where in the app
- **Location:** Toggle button in the Sidebar at bottom, theme applied globally via `<html data-theme="dark">`
- **Insertion point for toggle:** [Sidebar.tsx:70](client/components/Sidebar.tsx#L70) — just before the closing `</div>` of the sidebar, after `</nav>` (line 70)

### CSS Changes — [index.css](client/index.css)
- After the existing `:root` block (line 53), add:
  ```css
  [data-theme="dark"] {
    --wallstreet-900: #0f172a;
    --wallstreet-800: #1e293b;
    --wallstreet-700: #334155;
    --wallstreet-600: #475569;
    --wallstreet-accent: #60a5fa;
    --wallstreet-text: #f1f5f9;
    --wallstreet-500: #94a3b8;
    --wallstreet-danger: #f87171;
    --wallstreet-success: #4ade80;
    --wallstreet-warning: #fbbf24;
  }
  ```
- All Tailwind `bg-wallstreet-*` / `text-wallstreet-*` classes auto-adapt via CSS variables

### Frontend Changes
- **Modify:** [Sidebar.tsx](client/components/Sidebar.tsx)
  - Import `Sun`, `Moon` from lucide-react
  - Add state: `const [isDark, setIsDark] = useState(localStorage.getItem('theme') === 'dark')`
  - Add toggle button between `</nav>` (line 70) and closing `</div>` (line 71):
    ```tsx
    <div className="p-4 border-t border-wallstreet-700">
      <button onClick={toggleTheme}>
        {isDark ? <Sun /> : <Moon />} {isDark ? 'Light' : 'Dark'}
      </button>
    </div>
    ```
  - Toggle handler: `document.documentElement.dataset.theme = isDark ? '' : 'dark'` + `localStorage.setItem('theme', ...)`

### Critical: Hardcoded colors to migrate
Many components bypass CSS variables with hardcoded Tailwind. These MUST be converted:

| File | Hardcoded | Replace with |
|------|-----------|--------------|
| [KPICard.tsx:13](client/components/KPICard.tsx#L13) | `bg-white` | `bg-wallstreet-800` |
| [MetricCard.tsx:26](client/components/ui/MetricCard.tsx#L26) | `bg-white`, `border-slate-200`, `text-slate-900` | `bg-wallstreet-800`, `border-wallstreet-700`, `text-wallstreet-text` |
| [MetricCard.tsx:38](client/components/ui/MetricCard.tsx#L38) | `text-slate-500` | `text-wallstreet-500` |
| [PerformanceCharts.tsx:75](client/views/performance/PerformanceCharts.tsx#L75) | `bg-white`, `border-slate-200` | `bg-wallstreet-800`, `border-wallstreet-700` |
| [PerformanceCharts.tsx:266-305](client/views/performance/PerformanceCharts.tsx#L266-L305) | `bg-white`, `text-slate-900`, `bg-slate-50` | wallstreet equivalents |
| [PerformanceView.tsx:206](client/views/performance/PerformanceView.tsx#L206) | `bg-white`, `border-slate-200`, `text-slate-700` | wallstreet equivalents |
| [DashboardView.tsx:243-320](client/views/DashboardView.tsx#L243-L320) | Various `bg-white`, `text-slate-*` | wallstreet equivalents |
| Recharts Tooltip `bg-white/95` | All tooltip components | `bg-wallstreet-800/95` |
| All chart `stroke="#e2e8f0"` | CartesianGrid strokes | Use CSS variable or conditional |

**Scope estimate:** ~15-20 files need hardcoded color replacement. This is the bulk of the work.

---

## Feature 9: KPI Cards with Trend Indicators
**Goal:** Enhance MetricCard and KPICard to show period-over-period delta and optional sparkline.

### Where in the app
- **Components to modify:**
  - [MetricCard.tsx](client/components/ui/MetricCard.tsx) — used in Performance and Risk views
  - [KPICard.tsx](client/components/KPICard.tsx) — used in Dashboard view
- **Views that consume them:**
  - [PerformanceKPIs.tsx:31-60](client/views/performance/PerformanceKPIs.tsx#L31-L60) — 4 MetricCards (Return, Alpha, Sharpe, Sortino)
  - [RiskContributionView.tsx](client/views/risk/RiskContributionView.tsx) — 4 MetricCards (Vol, Diversification, Effective Bets, Top-3)
  - [DashboardView.tsx:272-320](client/views/DashboardView.tsx#L272-L320) — 4 KPICards

### Frontend Changes
- **Modify:** [MetricCard.tsx](client/components/ui/MetricCard.tsx)
  - Add optional props to `MetricCardProps` interface (line 5-13):
    ```ts
    delta?: number;        // e.g., +2.3 (shown as "+2.3%" in green or "-1.1%" in red)
    trend?: number[];      // array of ~30 recent values for sparkline
    ```
  - Below the `<p className="text-xl font-bold">` value (line 44), add:
    ```tsx
    {delta !== undefined && <span className={`text-xs font-mono ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}% vs prior
    </span>}
    ```
  - For sparkline: tiny `<LineChart>` (40x20px, no axes) from Recharts
- **Modify:** [PerformanceKPIs.tsx](client/views/performance/PerformanceKPIs.tsx)
  - Accept `previousPeriodMetrics?: PeriodMetrics` prop
  - Compute deltas: `delta={periodMetrics.sharpeRatio - previousPeriodMetrics.sharpeRatio}`
- **Modify:** [PerformanceView.tsx](client/views/performance/PerformanceView.tsx)
  - Compute metrics for previous period (e.g., if YTD selected, compute metrics as of 1 month ago from the same series data)
  - Pass `previousPeriodMetrics` to `<PerformanceKPIs>`

### Data Source
- All data already available in `data.series` — just filter to different date ranges to compute current vs previous metrics using existing `periodMetrics` logic (lines 113-173 of PerformanceView.tsx)

---

## Feature 10: Interactive Tooltip Drill-Down
**Goal:** Richer chart tooltips that show contextual breakdowns (top holdings in a sector, etc.).

### Where in the app
- **Charts to enhance (by priority):**
  1. **Attribution waterfall chart** — [AttributionCharts.tsx](client/views/attribution/AttributionCharts.tsx) — when hovering a sector bar, show top 3 tickers in that sector
  2. **Risk bar chart** — [RiskCharts.tsx](client/views/risk/RiskCharts.tsx) — when hovering a position bar, show full details (company, sector, beta, MCTR)
  3. **Sector deviation card** — [SectorDeviationCard.tsx](client/components/SectorDeviationCard.tsx) — when hovering a sector, show which holdings drive the deviation
  4. **Performance chart tooltips** — [PerformanceCharts.tsx:183-198](client/views/performance/PerformanceCharts.tsx#L183-L198) — already inline, enhance with more context

### Frontend Changes
- **New file:** `client/components/tooltips/EnrichedTooltip.tsx`
  - Shared rich tooltip component: takes `payload` from Recharts + `portfolioData` or `positions` context
  - Renders: primary value + breakdown table of related items
- **Modify each chart's `<Tooltip content={...}>` prop:**
  - Replace inline tooltip functions with `<EnrichedTooltip>` variant
  - Pass `portfolioData` or sector/position context as additional props to chart wrapper

### Key Pattern (Recharts custom tooltip)
```tsx
<Tooltip content={({ active, payload, label }) => (
  <EnrichedTooltip
    active={active} payload={payload} label={label}
    portfolioData={portfolioData}
    lookupBy="sector" // or "ticker"
  />
)} />
```

### Data Threading
- Attribution charts already receive `data: PortfolioItem[]` via [AttributionView.tsx:49](client/views/attribution/AttributionView.tsx#L49) prop
- Risk charts need `positions` from [RiskContributionView.tsx:14](client/views/risk/RiskContributionView.tsx#L14) `data.positions` — pass to `<RiskCharts>` and through to tooltip

---

## Feature 11: Print/Export Report Mode
**Goal:** One-click portfolio summary report rendered as a clean, printable multi-page layout.

### Where in the app
- **Trigger:** New button in Sidebar, between nav items and the bottom of the sidebar
- **Insertion point:** [Sidebar.tsx:70](client/components/Sidebar.tsx#L70) — add a "Generate Report" button before `</nav>` or in a footer section
- **Report renders as:** A new view (`ViewState.REPORT`) or an overlay/modal that assembles data from all views

### Frontend Changes
- **Add to** [types.ts:22-31](client/types.ts#L22-L31):
  - `REPORT = 'REPORT'` in `ViewState` enum
- **Modify** [Sidebar.tsx](client/components/Sidebar.tsx):
  - Add `Printer` icon import from lucide-react
  - Add nav item for "Report" after Risk Contribution (line ~58)
- **Modify** [App.tsx:195-253](client/App.tsx#L195-L253):
  - Add `ReportView` import and `viewPane(ViewState.REPORT, <ReportView ... />)` at line ~251
  - Pass all needed data: `portfolioData`, `customSectors`, `assetGeo`
- **New file:** `client/views/ReportView.tsx`
  - Assembles a print-optimized single-page layout:
    - **Header:** "Portfolio Report — {date}" with branding
    - **Section 1:** Holdings summary table (reuse [PortfolioTable](client/components/PortfolioTable.tsx) in compact mode)
    - **Section 2:** Performance chart snapshot (static image or simplified chart)
    - **Section 3:** Sector allocation vs benchmark
    - **Section 4:** Risk summary (top positions by risk contribution)
    - **Section 5:** Key metrics grid (Sharpe, Sortino, Alpha, Beta, Vol, MaxDD)
  - Auto-triggers `window.print()` or renders with a "Print" button
- **Modify** [index.css](client/index.css) (print section, lines 62-184):
  - Add `@media print` rules for report layout: A4/Letter, page breaks between sections

---

## Feature 12: Animated View Transitions
**Goal:** Smooth fade/slide when switching sidebar tabs.

### Where in the app
- **Exact location:** The `viewPane` helper function in [App.tsx:189-193](client/App.tsx#L189-L193):
  ```tsx
  const viewPane = (view: ViewState, children: React.ReactNode) => (
    <div key={view} style={{ display: currentView === view ? 'contents' : 'none' }}>
      {children}
    </div>
  );
  ```

### Frontend Changes
- **Modify** [App.tsx:189-193](client/App.tsx#L189-L193):
  - Change `viewPane` to use CSS transitions instead of `display: none`:
    ```tsx
    const viewPane = (view: ViewState, children: React.ReactNode) => (
      <div
        key={view}
        className={`transition-opacity duration-300 ease-in-out ${
          currentView === view ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0'
        }`}
      >
        {children}
      </div>
    );
    ```
  - Wrap the `<main>` content area in a `relative` container so absolute-positioned hidden views don't affect layout
  - The `<main>` tag at [App.tsx:205](client/App.tsx#L205) needs `relative` added to its className

### Constraint
- Views are kept mounted to preserve state (via `visitedViews` ref at line 182) — this approach preserves that behavior while adding smooth fading
- `pointer-events-none` prevents interaction with hidden views
- `absolute inset-0` stacks hidden views without taking layout space

---

## Feature 13: Data Freshness Indicators
**Goal:** Show "last updated" timestamps with staleness warnings on all data panels.

### Where in the app
- **Badges appear next to section headers in:**
  - [DashboardView.tsx:246](client/views/DashboardView.tsx#L246) — next to "Portfolio Holdings" `<h2>`
  - [PerformanceView.tsx:219](client/views/performance/PerformanceView.tsx#L219) — next to "Performance Deep Dive" `<h1>`
  - [RiskContributionView.tsx](client/views/risk/RiskContributionView.tsx) — next to "RISK CONTRIBUTION" header
  - [IndexView.tsx](client/views/IndexView.tsx) — next to index data sections
  - [AttributionView.tsx](client/views/attribution/AttributionView.tsx) — next to header

### Backend Changes
- **Modify all API response shapes** to include `fetchedAt`:
  - [risk.py:66](server/routes/risk.py#L66) — add `"fetchedAt": datetime.now().isoformat()` to backcast return
  - [risk.py:224](server/routes/risk.py#L224) — same for risk-contribution return
  - [market.py](server/routes/market.py) — add to sector/beta/dividend responses
  - For cached data: return cache file's `mtime` instead of current time (via `os.path.getmtime()`)

### Frontend Changes
- **New file:** `client/components/ui/FreshnessBadge.tsx`
  - Props: `fetchedAt: string` (ISO timestamp)
  - Displays: green dot + "2 min ago" (< 1 hour), amber + "3h ago" (< 24h), red + "2 days ago" (> 24h)
  - Implementation: `<span>` with colored dot (`bg-green-500`, `bg-amber-500`, `bg-red-500`) + relative time text
  - Uses `Date.now() - new Date(fetchedAt).getTime()` for age calculation
- **Modify:** [api.ts](client/services/api.ts)
  - When storing API responses (or localStorage cache), also store `fetchedAt` timestamp
  - Return `fetchedAt` alongside data from fetch functions
- **Modify each view** — add `<FreshnessBadge fetchedAt={...} />` next to headers (5 views)

---

## Feature 17: Peer Comparison (Model Portfolios)
**Goal:** Compare portfolio against model portfolios (60/40, All-World, Couch Potato, etc.).

### Where in the app
- **Location:** Inside the Performance view, add a multi-select dropdown to choose comparison portfolios
- **Dropdown insertion point:** [PerformanceCharts.tsx:104-143](client/views/performance/PerformanceCharts.tsx#L104-L143) — in the header bar, next to the period selector buttons
- **Additional lines in chart:** [PerformanceCharts.tsx:248-249](client/views/performance/PerformanceCharts.tsx#L248-L249) — after the Portfolio and Benchmark `<Line>` elements, add one `<Line>` per selected model portfolio

### Backend Changes
- **New file or section in** [constants.py](server/constants.py):
  ```python
  MODEL_PORTFOLIOS = {
      "60/40 Global": {"ACWI": 0.60, "AGG": 0.40},
      "Canadian Couch Potato": {"VCN.TO": 0.33, "XAW.TO": 0.33, "ZAG.TO": 0.34},
      "All-World Equity": {"ACWI": 1.0},
      "S&P 500": {"SPY": 1.0},
      "TSX 60": {"XIU.TO": 1.0},
  }
  ```
- **Extend** `/portfolio-backcast` in [risk.py:26-66](server/routes/risk.py#L26-L66):
  - Accept optional `comparisons: list[str] = []` in `BackcastRequest` model ([models.py](server/models.py))
  - For each selected model, build weighted returns using same `fetch_returns_df()` data, apply FX where needed
  - Return: `modelSeries: { "60/40 Global": [{date, value}, ...], ... }` alongside existing `series`
- **Add** `compute_model_portfolio_returns()` to [backcast_service.py](server/services/backcast_service.py) (after `build_benchmark_returns` ~line 111)

### Frontend Changes
- **Modify** [types.ts](client/types.ts):
  - Extend `BackcastRequest` (if typed) to include `comparisons?: string[]`
  - Extend `BackcastResponse` to include `modelSeries?: Record<string, {date: string, value: number}[]>`
- **Modify** [api.ts](client/services/api.ts):
  - `fetchPortfolioBackcast(items, comparisons?)` — pass comparisons to endpoint
  - `fetchAvailableModels()` — new GET endpoint or hardcoded client-side list
- **Modify** [PerformanceView.tsx](client/views/performance/PerformanceView.tsx):
  - Add state: `const [selectedModels, setSelectedModels] = useState<string[]>([])`
  - Pass `selectedModels` to API call at line ~62
  - Pass `modelSeries` to `<PerformanceCharts>`
- **Modify** [PerformanceCharts.tsx](client/views/performance/PerformanceCharts.tsx):
  - Accept `modelSeries` prop
  - Add multi-select dropdown (reuse [Dropdown.tsx](client/components/Dropdown.tsx) pattern) in the header area (line ~104)
  - For each model, add a dashed `<Line>` with distinct color after line 249:
    ```tsx
    {Object.entries(modelSeries).map(([name, _], i) => (
      <Line key={name} dataKey={name} stroke={MODEL_COLORS[i]} strokeDasharray="5 5" dot={false} />
    ))}
    ```
  - Merge model data into `chartData` (compute relative returns from same start point)

---

## Implementation Order (Recommended Session Sequence)

| Session | Feature | Effort | Status | Why this order |
|---------|---------|--------|--------|----------------|
| 1 | **#7 Dark Mode** | Large | | Foundation — touches CSS variables used by all future features. Must migrate hardcoded colors across ~15 files. |
| 2 | **#9 KPI Trends** | Small | | Quick visual win, enhances existing MetricCard/KPICard components |
| 3 | **#13 Freshness Badges** | Small | | Small scope, improves data trust across all views |
| 4 | **#12 Animated Transitions** | Small | DONE | Quick polish, single file change in App.tsx viewPane helper |
| 5 | **#1 Monthly Heatmap** | Medium | | New visualization, computed client-side from existing backcast data |
| 6 | **#3 Drawdown Analysis** | Medium | | Extends existing backcast infra + existing drawdowns ChartView |
| 7 | **#2 Rolling Metrics** | Medium | | New backend computation, builds on backcast_service.py |
| 8 | **#10 Rich Tooltips** | Medium | | Enhancement to existing chart tooltips, needs data threading |
| 9 | **#17 Peer Comparison** | Large | | New backend + frontend, depends on stable backcast infra |
| 10 | **#11 Report Export** | Large | | Capstone — assembles all views, best done after others are polished |

---

## Verification (Per Feature)
1. `cd server && python main.py` (start backend on :8000)
2. `cd client && npm run dev` (start frontend on :3000)
3. Load portfolio config from Upload view
4. Navigate to the modified view
5. Verify new components render with real data
6. Check browser console for errors
7. Test edge cases: empty data, single period, missing tickers
