# Master Plan: Portfolio Analytics Platform Improvements

## Context
The app is a full-stack portfolio analytics platform (React 19 + FastAPI) for a Canadian investor with cross-border holdings. It already features return attribution, risk decomposition, benchmark comparison, and FX adjustment. This master plan covers **10 selected improvements** to extract more insights and improve visuals. Each feature is designed as a standalone session. Features are numbered **1–10 from easiest to heaviest**.

---

## Feature 1: Animated View Transitions
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

## Feature 2: KPI Cards with Trend Indicators
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

## Feature 3: Data Freshness Indicators
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

## Feature 4: Drawdown Analysis Panel
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

## Feature 5: Rolling Metrics Dashboard
**Goal:** Line charts showing rolling 1M/3M/6M Sharpe, volatility, and beta over time. Portfolio + benchmark on each chart.

### Where in the app
- **Location:** Inside the Performance view, section directly below `<PerformanceCharts>`
- **Insertion point:** [PerformanceView.tsx:235](client/views/performance/PerformanceView.tsx#L235) region

### Backend Changes
- **New function in** [backcast_service.py](server/services/backcast_service.py) (after `compute_backcast_metrics` ~line 220):
  ```python
  def compute_rolling_metrics(portfolio_returns: pd.Series, benchmark_returns: pd.Series, windows=[21, 63, 126]):
      # Both args are pd.Series with DatetimeIndex — same params as compute_backcast_metrics()
      # For each window, slide and compute sharpe/vol/beta at each date for portfolio AND benchmark
  ```
  - Returns:
    ```python
    {
      "windows": {
        21:  [{"date": "YYYY-MM-DD", "portfolio": {"sharpe": float, "vol": float, "beta": float},
                                      "benchmark": {"sharpe": float, "vol": float, "beta": float}}, ...],
        63:  [...],
        126: [...]
      }
    }
    ```

- **New endpoint:** `POST /rolling-metrics` in [risk.py](server/routes/risk.py) at line 239+
  - Accepts same `BackcastRequest` model
  - Reuses same 4-step pipeline: `aggregate_weights → fetch_returns_df → build_portfolio_returns → build_benchmark_returns`
  - Then calls `compute_rolling_metrics(portfolio_returns, benchmark_returns)`

### Frontend Changes
- **New file:** `client/components/RollingMetricsChart.tsx`
  - 3 Recharts `<LineChart>` panels (Sharpe, Volatility, Beta) stacked vertically
  - **Single window toggle (1M / 3M / 6M)** — applies to ALL 3 charts simultaneously
  - Each metric has **independent Y-axis scale**
  - Portfolio line (solid) + Benchmark line (dashed) on each chart
  - Reuse chart styling from [PerformanceCharts.tsx](client/views/performance/PerformanceCharts.tsx) (CartesianGrid, XAxis, YAxis, Tooltip patterns)

- **New API call in** [api.ts](client/services/api.ts): `fetchRollingMetrics(items)`

- **Modify:** [PerformanceView.tsx](client/views/performance/PerformanceView.tsx)
  - Import and render `<RollingMetricsChart>` below `<PerformanceCharts>` at line ~235
  - No collapsible — render as visible section

---

## Feature 6: Interactive Tooltip Drill-Down
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

## Feature 8: Peer Comparison (Model Portfolios)
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

## Feature 9: Print/Export Report Mode
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

## Extra Feature: Dashboard Geographic Analysis (Post-Feature-3)

**Goal:** Enhance the Portfolio Holdings dashboard with geographic decomposition — toggle sector-level view to geography-level view, and add a new sector × geography cross-analysis table.

### Where in the app
- **Components modified/added:**
  - [SectorDeviationCard.tsx](client/components/SectorDeviationCard.tsx) — added `deviationView` toggle (Sectors ↔ Geography)
  - **NEW:** [SectorGeographyDeviationCard.tsx](client/components/SectorGeographyDeviationCard.tsx) — sector × geography delta matrix
  - [DashboardView.tsx](client/views/DashboardView.tsx) — changed 2-column → 3-column layout, fetch & wire geography data

### Frontend Changes (COMPLETED)
- **SectorDeviationCard:**
  - Added `useState<'SECTOR' | 'GEOGRAPHY'>` toggle in header
  - Geography view: 3 rows (Canada / United States / International) with Bench/Actual/Delta (same bar visualization)
  - Respects `assetGeo` manual overrides for ETF/MF geographic classification
  - Uses direct-sum logic (identical to prior panels) for consistency

- **SectorGeographyDeviationCard (NEW):**
  - 11 sectors × 3 geo columns (CA / US / INTL) matrix
  - Grouped layout: Cyclical / Sensitive / Defensive vertical labels (matches SectorDeviationCard styling)
  - Delta cells show signed %: positive with `+` prefix, negative in parentheses `(2.83%)`
  - Heatmap-style conditional formatting: light rose-200 → white → light emerald-200 gradient
  - TOTAL row uses direct-sum logic (portfolio by geo minus benchmark by geo) — ensures consistency with Geography toggle totals
  - Portfolio geo classification: `.TO` suffix = CA, manual `assetGeo` override, else US → INTL = remainder
  - Benchmark geo distribution: proportional distribution of sector weights across geographies (smart client-side cross-product)

- **DashboardView:**
  - Fetches `benchmarkGeography` from `/index-exposure` endpoint alongside sectors
  - Changed grid from `lg:grid-cols-2 min-h-[450px]` → `lg:grid-cols-3 items-stretch` for equal-height panels
  - All 3 cards (PortfolioEvolution, SectorDeviation, SectorGeoDeviation) maintain same height regardless of content

### Data Flow
- `/index-exposure` returns `{ sectors: [...], geography: [...], ... }`
- Geography data already has CA/US/INTL distribution from backend
- Portfolio geo classification matches existing KPI "Currency Exposure" logic
- Benchmark sector × geo cross-product computed client-side (no backend changes required)

### UX Notes
- **Vertical height:** All 3 panels maintain fixed height regardless of toggle state (Geography view doesn't collapse the card)
- **Color consistency:** Uses same emerald-500 / rose-500 colors as existing SectorDeviationCard bars
- **Font styling:** Sector names colored by group (Cyclical=red, Sensitive=blue, Defensive=green)
- **Parentheses:** Negative values formatted as `(2.83%)` not `-2.83%`

### Potential Enhancement for Better Contrast
- **Conditional formatting:** Current heatmap uses light pastels (rose-200/emerald-200 backgrounds with rose-600/emerald-600 text) for a soft look.
- **For improved contrast on smaller screens or print:**
  - Increase background saturation (rose-100 → rose-150, emerald-100 → emerald-150)
  - Or use darker text for low-magnitude cells (threshold: |delta| < 0.5%)
  - Test on mobile/print media before finalizing
  - Consider `@media print` rule to boost saturation for printed reports

---

## Extra Feature: Risk Contribution Tab Overhaul

**Goal:** Elevate the Risk Contribution tab from a basic MCTR table into a full risk intelligence dashboard — adding a correlation matrix, return-vs-risk quadrant, tail risk metrics (VaR/CVaR), and a portfolio treemap.

### Current State (what already exists)
- 4 KPI cards: Portfolio Vol, Diversification Ratio, Effective Bets, Top-3 Concentration
- Bar chart: Risk % vs Weight (absolute / ratio toggle, expand modal for >10 positions)
- Scatter plot: Weight vs Risk contribution (diagonal "fair share" line)
- Sector Risk Decomposition bar chart
- Sortable RiskTable with: Weight, Vol, Beta, MCTR, Risk %, Risk-Adj Return columns
- Actual / Historical position mode toggle

### What's Missing / Improvable
1. **Correlation Matrix** — most glaring gap; no way to see how holdings move together
2. **Return vs Risk Quadrant** — data already exists (annualizedReturn + pctOfTotalRisk per position), just needs a dedicated chart
3. **Tail Risk KPIs** — Vol only; missing historical VaR (95/99%) and CVaR (Expected Shortfall)
4. **Portfolio Treemap** — intuitive size=weight, color=risk_ratio view; more scannable than bars for 20+ positions
5. **Portfolio Beta KPI** — current KPIs don't show overall portfolio beta vs benchmark

---

### Sub-feature A: Correlation Matrix

**Where in the app:** New panel inside `RiskCharts.tsx`, added below the existing scatter plot row.

**Backend Changes — [risk.py](server/routes/risk.py)**
- Inside the `compute_risk_contribution()` function (currently ends at line ~238), add correlation matrix computation:
  ```python
  corr_matrix = returns_df[ticker_list].corr().round(3)
  correlation = {
      "tickers": ticker_list,
      "matrix": corr_matrix.values.tolist()   # row-major 2D list
  }
  ```
- Add `"correlation": correlation` to the return dict (line ~227)

**Frontend Changes — [types.ts](client/types.ts)**
- Extend `RiskContributionResponse` with:
  ```ts
  correlation?: { tickers: string[]; matrix: number[][] };
  ```

**Frontend Changes — New file: `client/components/CorrelationMatrix.tsx`**
- Renders an N×N grid using `<div>` grid layout (no Recharts needed)
- Cell background: red gradient for high positive correlation (> 0.7), white/neutral for ~0, blue for negative
- Color scale: `interpolate(value, -1, 1)` → `hsl(220, 70%, 55%)` … `white` … `hsl(0, 70%, 55%)`
- Diagonal cells: gray fill (correlation with self = 1.0, not meaningful)
- Hover tooltip: "{tickerA} / {tickerB}: {value}"
- Props: `tickers: string[]`, `matrix: number[][]`
- Collapse to top 10 by risk if N > 15 (too dense otherwise), with "Show all" toggle

**Frontend Changes — [RiskCharts.tsx](client/views/risk/RiskCharts.tsx)**
- Import `CorrelationMatrix`
- Add as a full-width panel below the 2-column scatter/bar row:
  ```tsx
  {correlation && <CorrelationMatrix tickers={correlation.tickers} matrix={correlation.matrix} />}
  ```

---

### Sub-feature B: Return vs Risk Quadrant Chart

**Where in the app:** Replace the current standalone scatter plot (Weight vs Risk) with a tabbed/toggle pair: **Weight vs Risk** (existing) and **Return vs Risk** (new). The toggle sits in the chart header, same pattern as the Absolute/Ratio toggle in the bar chart.

**No backend changes needed** — all data already in `positions[].annualizedReturn` and `positions[].pctOfTotalRisk`.

**Frontend Changes — [RiskCharts.tsx](client/views/risk/RiskCharts.tsx)**
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

### Sub-feature C: Tail Risk KPIs (VaR / CVaR)

**Where in the app:** Extend the 4-card KPI row to a 6-card row (or replace the least useful card — "Top-3 Concentration" is already shown in the table — with VaR + CVaR).

**Backend Changes — [risk.py](server/routes/risk.py)**
- Inside `compute_risk_contribution()`, after computing `port_vol`, add:
  ```python
  import scipy.stats as stats
  port_returns_series = (returns_df[ticker_list] * w).sum(axis=1).dropna()
  var_95 = float(np.percentile(port_returns_series, 5)) * 100          # daily VaR 95%
  var_99 = float(np.percentile(port_returns_series, 1)) * 100          # daily VaR 99%
  cvar_95 = float(port_returns_series[port_returns_series <= np.percentile(port_returns_series, 5)].mean()) * 100
  ```
- Add to return dict: `"var95": round(var_95, 2)`, `"var99": round(var_99, 2)`, `"cvar95": round(cvar_95, 2)`
- These are daily figures; annualized by ×√252 is optional — show as daily (cleaner for interpretation)

**Frontend Changes — [types.ts](client/types.ts)**
- Extend `RiskContributionResponse`: `var95?: number; var99?: number; cvar95?: number;`

**Frontend Changes — [RiskContributionView.tsx](client/views/risk/RiskContributionView.tsx)**
- Change KPI grid from `grid-cols-4` to `grid-cols-3 lg:grid-cols-6` (or keep 4 and swap Top-3 for VaR 95%)
- Proposed final 6-card layout:
  1. Portfolio Volatility (existing)
  2. Portfolio Beta *(new — see sub-feature D)*
  3. Diversification Ratio (existing)
  4. Effective Bets (existing)
  5. VaR 95% (daily) *(new)*
  6. CVaR 95% (daily) *(new)*

---

### Sub-feature D: Portfolio Beta KPI

**Where in the app:** New KPI card alongside existing 4; becomes part of the 6-card row in sub-feature C.

**Backend Changes — [risk.py](server/routes/risk.py)**
- Portfolio beta vs benchmark already computed implicitly via MCTR. Add explicit weighted-average beta:
  ```python
  portfolio_beta = float(np.dot(w, betas))
  ```
  where `betas` already exists (line ~191 in current code). Add `"portfolioBeta": round(portfolio_beta, 2)` to return dict.

**Frontend Changes — [types.ts](client/types.ts)**
- Extend `RiskContributionResponse`: `portfolioBeta?: number;`

**Frontend Changes — [RiskContributionView.tsx](client/views/risk/RiskContributionView.tsx)**
- New `<MetricCard>` for Beta:
  ```tsx
  <MetricCard title="Portfolio Beta" value={data ? `${data.portfolioBeta.toFixed(2)}` : '—'}
    subtitle="vs blended benchmark" isPositive={data ? Math.abs(data.portfolioBeta - 1) < 0.2 : undefined}
    icon={Activity} loading={loading} />
  ```

---

### Sub-feature E: Portfolio Treemap

**Where in the app:** New full-width panel in RiskCharts, toggled on/off by a button in the section header. Position: below the correlation matrix (bottom of the view), as it's supplemental.

**No backend changes needed** — uses existing `positions[].weight` and `positions[].pctOfTotalRisk`.

**Frontend Changes — New file: `client/components/RiskTreemap.tsx`**
- Use Recharts `<Treemap>` (already available in recharts package)
- Data: `positions.map(p => ({ name: p.ticker, size: p.weight, riskRatio: p.pctOfTotalRisk / p.weight }))`
- Cell color: same green/red palette as scatter — `riskRatio > 1 ? red gradient : green gradient`
- Cell label: ticker + "\n" + weight% (two lines, fontSize 10/11)
- Tooltip: full position card (same content as existing bar chart tooltip — ticker, weight, risk%, ratio, beta)
- Props: `positions: RiskPosition[]`

**Frontend Changes — [RiskCharts.tsx](client/views/risk/RiskCharts.tsx)**
- Import `RiskTreemap`
- Add state `showTreemap: boolean` (default false) — lifted from `RiskContributionView` or local
- Add toggle button in a new "Views" section header:
  ```tsx
  <button onClick={() => setShowTreemap(v => !v)}>
    {showTreemap ? 'Hide Treemap' : 'Show Treemap'}
  </button>
  ```
- Render `{showTreemap && <RiskTreemap positions={positions} />}` as full-width panel

---

### Implementation Order for this Feature

| Step | Sub-feature | Effort | Backend? | Frontend? |
|------|-------------|--------|----------|-----------|
| 1 | **D: Portfolio Beta KPI** | XS | 1 line | 1 card |
| 2 | **C: Tail Risk KPIs (VaR/CVaR)** | Small | ~10 lines | 2 cards + type |
| 3 | **B: Return vs Risk Quadrant** | Small | None | Toggle + chart mode |
| 4 | **E: Portfolio Treemap** | Medium | None | New component |
| 5 | **A: Correlation Matrix** | Medium | ~10 lines | New component (most visual work) |

---

## Implementation Order (Easiest → Heaviest)

| Session | Feature | Effort | Status | Why this order |
|---------|---------|--------|--------|----------------|
| 1 | **#1 Animated Transitions** | Small | DONE | Quick polish, single file change in App.tsx viewPane helper |
| 2 | **#2 KPI Trends** | Small | DONE | Quick visual win, enhances existing MetricCard/KPICard components |
| 3 | **#3 Freshness Badges** | Small | DONE | Small scope, new component + backend timestamps across views |
| Extra | **Dashboard Geographic Analysis** | Medium | DONE | Custom request — enhances Holdings tab with geo decomposition & cross-analysis table |
| 4 | **#4 Drawdown Analysis** | Medium | DONE | Extends existing backcast infra + existing drawdowns ChartView |
| 5 | **#5 Rolling Metrics** | Medium | DONE | New backend computation, builds on backcast_service.py |
| 6 | **#6 Rich Tooltips** | Medium | DONE | Enhancement to existing chart tooltips, needs data threading |
| Extra | **Risk Contribution Overhaul** | Medium-Large | | 5 sub-features: Beta KPI → VaR/CVaR → Return/Risk quadrant → Treemap → Correlation matrix |
| 7 | **#7 Dark Mode** | Large | DONE | Foundation — touches CSS variables, must migrate hardcoded colors across ~15 files |
| 8 | **#8 Peer Comparison** | Large | | New backend + frontend, depends on stable backcast infra |
| 9 | **#9 Report Export** | Large | | Capstone — assembles all views, best done after others are polished |

---

## Verification & Approval Workflow

### Per Feature Testing
1. `cd server && python main.py` (start backend on :8000)
2. `cd client && npm run dev` (start frontend on :3000)
3. Load portfolio config from Upload view
4. Navigate to the modified view
5. Verify new components render with real data
6. Check browser console for errors
7. Test edge cases: empty data, single period, missing tickers

### Status Update Process
When coding is complete for a feature:
1. **Agent** asks you to test the feature in the browser
2. **You** test it and report back ✅ good / ❌ issues
3. **If good:** Agent updates the Status column to `DONE` in the Implementation Order table
4. **If issues:** Agent helps debug, then re-test

Current feature markers:
- `DONE` = Feature tested, approved, and committed
- _(blank)_ = Feature pending or in progress

---

## Potential Ideas (Backlog)

### Monthly Performance Heatmap
**Goal:** Calendar-style grid showing monthly returns, color-coded by magnitude. Reveals seasonality and streaks.

**Rationale:** Skipped because monthly contribution totals are already visible in the contribution heatmap's last line. Low ROI for dedicated visualization unless year-over-year seasonality patterns are a priority. Can be revisited as a lighter micro-visualization in the Performance view sidebar if needed.

### Where in the app (if implemented)
- **Location:** Inside the Performance view, as a new section BELOW the existing `<PerformanceCharts>` and ABOVE the bottom grid (Period Snapshot / Risk Interpretation tables)
- **Insertion point:** [PerformanceView.tsx:234](client/views/performance/PerformanceView.tsx#L234) — after `<PerformanceCharts ... />` closing tag (line 235), before `</div>` closing the main container

### Implementation (if revisited)
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

### Group Row Highlighting (Sector × Geography Table)
**Goal:** Apply consistent group background color to all sectors within a group (Cyclical/Sensitive/Defensive) in the SectorGeographyDeviationCard table.

**Status:** Attempted but blocked by inline style specificity. The delta cells use `getDeltaBg()` computed colors with inline `backgroundColor` styles, which override Tailwind background classes even when set to `undefined` for near-zero values.

**Challenge:**
- Delta visualization (green for positive, red for negative gradient) is intentional design for showing magnitude
- Group highlighting would conflict with or be hidden behind delta coloring
- Inline styles have higher CSS specificity than Tailwind classes

**Potential solutions (if revisited):**
1. **Layer backgrounds:** Use CSS `background-image: linear-gradient()` to blend group color + delta color
2. **Box-shadow approach:** Apply group color as `inset box-shadow` instead of background
3. **Pseudo-element overlay:** Add `::before` with group color at low opacity
4. **Redesign delta visualization:** Use text color or border accent instead of background color for delta magnitude
5. **Split cells:** Separate "group background" container from "delta magnitude" indicator

**Where:** [SectorGeographyDeviationCard.tsx:230-240](client/components/SectorGeographyDeviationCard.tsx#L230-L240) (DeltaCell component)
