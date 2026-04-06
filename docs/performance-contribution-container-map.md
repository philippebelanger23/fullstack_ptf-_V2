# Performance / Contribution Container Map

## Goal

Document how these containers are populated today:

- Return Waterfall (Top 10)
- Attribution Analysis
- Heatmap
- Tables
- Relative Performance
- One-pager performance data

The main question is whether the app is using the canonical workspace path or older duplicate logic in front of it.

## Canonical Source Of Truth

The live app now boots from a single workspace request:

- Client entry: `client/App.tsx`
- API call: `fetchPortfolioWorkspace(...)` in `client/services/api.ts`
- Server route: `POST /portfolio-workspace` in `server/routes/portfolio.py`
- Server builder: `build_portfolio_workspace(...)` in `server/services/workspace_service.py`

That workspace payload is split into:

- `workspace.holdings`
- `workspace.attribution`
- `workspace.performance`
- `workspace.risk`
- `workspace.audit`

In `client/App.tsx`, the active views are fed from that workspace:

- `portfolioData = workspace.holdings.items`
- `attributionData = workspace.attribution`
- `performanceVariant = workspace.performance.variants['75/25']`
- `workspaceRisk = workspace.risk`

This is the canonical path.

## Server Build Shape

`build_portfolio_workspace(...)` currently produces the fields that matter for this investigation:

- `holdings.items`
  - Flat per-period holdings rows with `ticker`, `date`, `weight`, `returnPct`, `contribution`, flags, and price coverage.
- `attribution.periodSheet`
  - Sub-period contribution table.
- `attribution.monthlySheet`
  - Calendar-month contribution table.
- `attribution.topContributors`
  - Prebuilt monthly and quarterly top-contributor tables.
- `attribution.portfolioPeriodReturns`
  - Portfolio return map by normalized sub-period.
- `attribution.portfolioMonthlyReturns`
  - Portfolio return map by normalized month.
- `attribution.portfolioYtdReturn`
  - Geometric chain of `portfolioMonthlyReturns`.
- `performance.variants[*]`
  - Backcast metrics and time series.
- `performance.variants['75/25'].periodAttribution`
  - Per-period attribution rebuilt from the same daily backcast series.

Important split:

- `workspace.attribution` comes from the attribution pipeline in `workspace_service.py`.
- `workspace.performance.variants['75/25'].periodAttribution` comes from the backcast pipeline in `_build_performance_section(...)` using `compute_period_attribution(...)`.

Those are related, but they are not the same object.

## Repo-Wide Parallel Worlds Audit

This section is the codebase-wide zombie inventory, not just the container map.

### 1. Two server attribution engines still exist

Active canonical engine:

- `server/services/workspace_service.py::build_portfolio_workspace(...)`

Legacy engine:

- `server/routes/portfolio.py::run_portfolio_analysis(...)`

Why this matters:

- Both build period and monthly attribution-like outputs.
- They do it through different internal functions.
- They are close enough to be confused, but not the same implementation.

Legacy engine path:

- `normalize_portfolio_periods(...)`
- `calculate_returns(...)`
- `build_results_dataframe(...)`
- `build_monthly_dataframe(...)`
- `calculate_benchmark_returns(...)`
- `calculate_monthly_benchmark_returns(...)`

Canonical engine path:

- `_build_input_state(...)`
- `_build_price_map(...)`
- `_build_holding_facts(...)`
- `_build_period_dataframe(...)`
- `_build_monthly_dataframe(...)`
- `_build_benchmark_lists(...)`
- `_build_top_contributor_layouts(...)`
- `_build_performance_section(...)`
- `_build_risk_section(...)`

Audit verdict:

- `run_portfolio_analysis(...)` is the original parallel world.
- `build_portfolio_workspace(...)` is the current live world.

### 2. Legacy compatibility routes still expose the old mental model

Still present:

- `POST /analyze-manual`
- `POST /portfolio-backcast`
- `POST /risk-contribution`
- `POST /rolling-metrics`

Observed state:

- The live client uses `POST /portfolio-workspace`.
- The legacy risk/performance routes now just wrap `build_portfolio_workspace(...)`.
- `/analyze-manual` is still truly separate.

Audit verdict:

- `/portfolio-backcast`, `/risk-contribution`, and `/rolling-metrics` are compatibility wrappers.
- `/analyze-manual` is real legacy logic and the biggest source of accidental apples-to-oranges comparisons.

### 3. Vite proxy still advertises dead or stale routes

File:

- `client/vite.config.ts`

Findings:

- `/portfolio-workspace` is proxied and active.
- Legacy routes are still proxied:
  - `/analyze-manual`
  - `/portfolio-backcast`
  - `/risk-contribution`
  - `/rolling-metrics`
- `/analyze` is also proxied.

Important detail:

- There is no active `/analyze` route in the current server routers.

Audit verdict:

- `/analyze` in the proxy is zombie infrastructure.
- The rest of the legacy proxies keep the old surface area alive even though the app no longer needs them for the main flow.

### 4. Server README is stale and still describes the old world

File:

- `server/README.md`

Findings:

- It documents `POST /analyze`.
- It highlights `POST /analyze-manual` and `POST /portfolio-backcast`.
- It says `main.py` contains all endpoints.

Current reality:

- The app is router-based.
- The live frontend entrypoint is `POST /portfolio-workspace`.
- `/analyze` is not part of the active router set found in the server code.

Audit verdict:

- `server/README.md` is zombie documentation and should not be treated as architecture truth.

### 5. Canonical attribution fields exist on the wire but are not consumed

Produced by the server:

- `workspace.attribution.portfolioMonthlyReturns`
- `workspace.attribution.portfolioYtdReturn`

Observed usage:

- They are defined in `client/types.ts`.
- They are populated in `server/services/workspace_service.py`.
- They are not read anywhere in the client.

Audit verdict:

- These are canonical fields with zero live consumers.
- Meanwhile the client recomputes equivalent totals locally.

### 6. One-pager has an orphaned canonical prop path

Files:

- `client/App.tsx`
- `client/views/ReportView.tsx`

Findings:

- `App.tsx` passes `attributionData={workspace.attribution}` to `ReportView`.
- `ReportViewProps` declares `attributionData?: PortfolioWorkspaceAttribution | null`.
- `ReportView` does not destructure that prop.
- The one-pager attribution table instead uses `backcast.periodAttribution`.

Audit verdict:

- This is not just duplicate logic.
- It is a dead prop path with a live alternate data branch sitting beside it.

### 7. `RelativePerformancePanel.tsx` is dead UI code

File:

- `client/views/performance/RelativePerformancePanel.tsx`

Finding:

- The file exists.
- It is not imported anywhere in the client.
- The live app uses `UnifiedPerformancePanel.tsx` instead.

Audit verdict:

- This is pure zombie code.

### 8. Report and Performance views duplicate the same series transform logic

Files:

- `client/views/performance/PerformanceView.tsx`
- `client/views/ReportView.tsx`

Shared duplicated logic:

- `selectedPeriod` windowing with `getDateRangeForPeriod(...)`
- absolute chart transform
- relative chart transform
- drawdown transform

Extra duplicate:

- `PerformanceView.tsx` computes `periodMetrics` locally with `computeMetricsFromSeries(...)`
- Server already has canonical KPI math in `server/services/backcast_service.py`

Audit verdict:

- This is a presentation-layer parallel world.
- It is less dangerous than `/analyze-manual`, but it still multiplies debug surface area.

### 9. AttributionView has its own client attribution math layer on top of server attribution

Files:

- `client/views/attribution/AttributionView.tsx`
- `client/views/attribution/canonicalAttribution.ts`

Client-side recomputes:

- `compoundContribution(...)`
- `compoundReturnPct(...)`
- `buildCanonicalMonthlyHistory(...)`
- `buildTableItemsFromHistory(...)`
- `buildAttributionTickerStats(...)`
- local portfolio total aggregation

Why this matters:

- These helpers are useful for view shaping.
- But they also create a second attribution math surface in the client.

Audit verdict:

- This is not dead code.
- It is an active secondary math layer that can drift from the canonical server layer if we are not strict.

### 10. Comments still describe the previous architecture

File:

- `client/App.tsx`

Findings:

- Comments still reference `/analyze-manual`.
- Comments describe a “mergedPortfolioData” style mental model that is no longer how the app is actually wired.

Audit verdict:

- These are small zombies, but they increase architectural confusion during debugging.

## Container Map

### 1. Return Waterfall (Top 10)

File:

- `client/views/attribution/AttributionView.tsx`
- Chart component in `client/views/attribution/AttributionCharts.tsx`

Population path:

1. `AttributionView` receives `attributionData = workspace.attribution`.
2. `buildCanonicalMonthlyHistory(analysisResponse, data)` builds canonical monthly rows.
3. `filteredOverviewData` applies year / quarter filtering.
4. `buildAttributionTickerStats(...)` compounds contribution and return by ticker.
5. `sortedByContrib` ranks tickers.
6. `waterfallData` takes top 10 by absolute contribution and adds an `Others` bucket.

Current source mix:

- Ticker rows: derived client-side from canonical monthly rows.
- Total bar: `portfolioTotalReturn`, recomputed client-side from `filteredOverviewData` monthly contribution sums.

Canonical note:

- This container is mostly on the canonical path.
- But the total is not read from `workspace.attribution.portfolioYtdReturn` or `portfolioMonthlyReturns`; it is recomputed in the client.

Debug note:

- This is a likely duplicate layer in front of the canonical monthly return map.

### 2. Attribution Analysis

File:

- `client/views/attribution/AttributionView.tsx`
- Charts in `client/views/attribution/AttributionCharts.tsx`

Population path:

1. Base holdings contribution data comes from `workspace.attribution` through `buildCanonicalMonthlyHistory(...)`.
2. Sector classification comes from `fetchSectors(...)`.
3. Benchmark exposure comes from `fetchIndexExposure(...)`.
4. Sector benchmark history comes from `fetchSectorHistory(...)`.
5. `sectorAttributionData` is then built client-side by combining:
   - portfolio contribution/performance rows
   - ticker sector mapping
   - benchmark sector weights
   - benchmark sector return history

Canonical note:

- Portfolio-side numbers are sourced from the workspace attribution payload.
- Benchmark-side comparison data is still assembled outside the workspace with separate fetches.

Debug note:

- This container is not fully canonical end-to-end because sector benchmark inputs are still loaded independently in the view.

### 3. Heatmap

File:

- `client/views/attribution/AttributionView.tsx`

Population path:

1. `yearTickerStats` is built from canonical monthly history.
2. `buildAttributionMatrixData(...)` creates `matrixData`.
3. Contribution mode reads `row[key]`, which comes from monthly contribution history.
4. Performance mode reads `row['p-' + key]`, which comes from monthly return history.
5. Footer totals use:
   - contribution mode: sums of `matrixData`
   - performance mode: `portfolioMonthlyPerformance` and `portfolioTotalPerformance`

Current source mix:

- Cell data is canonical-derived.
- Portfolio monthly totals are recomputed in the client from filtered rows, not read from `workspace.attribution.portfolioMonthlyReturns`.

Canonical note:

- Good base source.
- Duplicate aggregation still exists in front of the canonical portfolio return map.

### 4. Tables

File:

- `client/views/attribution/AttributionView.tsx`

There are three table modes.

#### `monthly`

Population path:

- First choice: `workspace.attribution.topContributors`
- Fallback: `buildTableItemsFromHistory(...)` over canonical monthly rows

This is the cleanest usage of canonical data in the attribution view.

#### `month`

Population path:

- Reads `analysisResponse.monthlyPeriods`
- Reads `yearMatrixData`
- Renders a dense per-month matrix using canonical monthly history and canonical monthly boundaries

#### `period`

Population path:

- Reads `analysisResponse.periodSheet`
- Filters it down to the selected year
- Recomputes `ytdReturn` and `ytdContrib` client-side for the selected subset

Canonical note:

- The tables are anchored to `workspace.attribution`.
- The `monthly` mode is best aligned because it directly prefers server-built `topContributors`.
- The `month` and `period` modes still do client-side reshaping and recomposition.

### 5. Relative Performance

Files:

- `client/views/performance/PerformanceView.tsx`
- `client/views/performance/PerformanceCharts.tsx`
- `client/views/performance/UnifiedPerformancePanel.tsx`
- Also reused in `client/views/ReportView.tsx`

Population path:

1. `PerformanceView` receives `workspace.performance.variants`.
2. Selected benchmark picks a variant.
3. `chartData` is rebuilt client-side from `variant.series`.
4. When `chartView === 'relative'`, the client computes:
   - portfolio return since selected start
   - benchmark return since selected start
   - `Excess Return = portfolio - benchmark`

Canonical note:

- The source series is canonical.
- Relative performance itself is not precomputed on the server; it is a client transform of the canonical series.

This is acceptable duplication because it is a view-specific transform, not a second data pipeline.

### 6. One-Pager Performance Data

File:

- `client/views/ReportView.tsx`

Population path:

- Performance chart:
  - Comes from `performanceVariant = workspace.performance.variants['75/25']`
  - `chartData` is rebuilt from `backcast.series`
  - Rendered with `UnifiedPerformancePanel`

- Risk panel data:
  - Comes from `workspaceRisk = workspace.risk`

- Attribution mini-table on the one-pager:
  - Does **not** use `workspace.attribution`
  - Uses `backcast.periodAttribution`
  - Filters by selected period
  - Re-aggregates with `buildTableItemsFromHistory(...)`

Important mismatch:

- `App.tsx` passes `attributionData={workspace.attribution}` into `ReportView`.
- `ReportView` defines `attributionData` in its props interface.
- But `ReportView` does not destructure or use that prop.

That means the one-pager attribution table is currently driven by the performance backcast attribution path, not the attribution workspace path.

## Junk / Legacy / Duplicate Layers

These are the main places where old or duplicate logic still sits in front of the canonical path.

### A. Legacy endpoints still exist

Files:

- `server/routes/portfolio.py`
- `server/routes/risk.py`

Legacy or compatibility routes still present:

- `POST /analyze-manual`
- `POST /portfolio-backcast`
- `POST /risk-contribution`
- `POST /rolling-metrics`

Reality:

- `/portfolio-backcast`, `/risk-contribution`, and `/rolling-metrics` now proxy through `build_portfolio_workspace(...)`.
- `/analyze-manual` is still a separate older pipeline.

Conclusion:

- The app shell is on the canonical workspace route.
- The old analysis route still exists beside it and can still confuse debugging if we compare outputs without noting the route.

### B. Attribution view recomputes portfolio monthly totals locally

Files:

- `client/views/attribution/AttributionView.tsx`

Current local recomputes:

- `portfolioMonthlyPerformance`
- `portfolioTotalReturn`
- waterfall total bar
- heatmap performance footer totals

These values could be sourced from:

- `workspace.attribution.portfolioMonthlyReturns`
- `workspace.attribution.portfolioYtdReturn`

Conclusion:

- This is one of the clearest examples of duplicate logic in front of canonical server values.

### C. One-pager attribution is wired to performance attribution, not workspace attribution

Files:

- `client/views/ReportView.tsx`
- `server/services/workspace_service.py`

Current state:

- One-pager table uses `backcast.periodAttribution`
- ReportView ignores the passed `attributionData`

Conclusion:

- This is the strongest “wrong container fed by the wrong branch” candidate for debugging.

### D. Benchmark comparison inputs in Attribution Analysis are still fetched ad hoc

Files:

- `client/views/attribution/AttributionView.tsx`

Current state:

- `fetchIndexExposure`
- `fetchSectorHistory`
- `fetchSectors`

Conclusion:

- Portfolio contribution data is canonical.
- Attribution benchmark context is still assembled in the page, so debugging requires checking both workspace data and live auxiliary fetches.

### E. `portfolioMonthlyReturns` and `portfolioYtdReturn` are canonical but effectively dead

Files:

- `server/services/workspace_service.py`
- `client/types.ts`

Current state:

- Server computes them.
- Client type system knows about them.
- No client view reads them.

Conclusion:

- These are canonical values with no active rendering path.

### F. `RelativePerformancePanel.tsx` is an unused superseded component

Files:

- `client/views/performance/RelativePerformancePanel.tsx`
- `client/views/performance/UnifiedPerformancePanel.tsx`

Current state:

- `UnifiedPerformancePanel` is the active panel.
- `RelativePerformancePanel` is not imported anywhere.

Conclusion:

- This is removable zombie UI.

### G. `ReportView` and `PerformanceView` duplicate chart derivation logic

Files:

- `client/views/ReportView.tsx`
- `client/views/performance/PerformanceView.tsx`

Current state:

- Both derive chart series from the same canonical backcast data.
- Both implement their own absolute / relative / drawdown transforms.
- Only one of them computes period KPI metrics.

Conclusion:

- This is duplicated view logic, not dead code.
- It still creates another parallel surface for bugs.

### H. Config and docs still keep the dead routes visible

Files:

- `client/vite.config.ts`
- `server/README.md`

Current state:

- Proxy still exposes `/analyze`.
- README still documents the old route world.

Conclusion:

- Even if runtime behavior is mostly canonical now, the surrounding tooling still points engineers at the wrong architecture.

## Recommended Debug Order

If the goal is to reduce noise and move fully onto the canonical path, debug in this order:

1. Pick one authority for attribution debugging: `workspace.attribution`, not `/analyze-manual`.
2. Make the attribution view read portfolio totals from `workspace.attribution.portfolioMonthlyReturns` and `portfolioYtdReturn` instead of recomputing them.
3. Rewire the one-pager attribution table so it either consumes `workspace.attribution` directly or deliberately documents why `performance.periodAttribution` is the intended source.
4. Remove or quarantine pure zombies:
   - `RelativePerformancePanel.tsx`
   - `/analyze` proxy entry
   - stale README route claims
5. If `PerformanceView` and `ReportView` still disagree after that, centralize the shared chart transform logic.
6. If Attribution Analysis still disagrees after steps 1-5, inspect auxiliary benchmark fetches separately from portfolio contribution math.

## Bottom Line

The canonical path is real and already active:

- `App -> fetchPortfolioWorkspace -> /portfolio-workspace -> build_portfolio_workspace`

But there is still junk in front of it:

- legacy `/analyze-manual`
- local recomputation of portfolio monthly / total attribution returns in `AttributionView`
- one-pager attribution using `performance.periodAttribution` instead of `workspace.attribution`
- auxiliary benchmark fetches still living outside the workspace payload
- stale proxy / README references to old routes
- an unused `RelativePerformancePanel.tsx`
- duplicate chart transform logic in `ReportView` and `PerformanceView`
- canonical server fields (`portfolioMonthlyReturns`, `portfolioYtdReturn`) that are produced but never consumed

If we want one clean debugging spine, `workspace.attribution` and `workspace.performance` should be treated as the only authoritative inputs, and every container should either read those fields directly or do only trivial presentation transforms on top.
