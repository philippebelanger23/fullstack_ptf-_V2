# Canonical Workspace Audit Plan

## Objective

Make the canonical portfolio workspace the only app-level source of truth for populated portfolio views.

That means all client views should derive state from:

- `workspace.holdings`
- `workspace.attribution`
- `workspace.performance`
- `workspace.risk`
- `workspace.audit`

and not from legacy attribution/backcast side paths that bypass the workspace attribution contract.

## Current Audit Summary

### Confirmed canonical source

- The app shell already boots from `fetchPortfolioWorkspace(...)`.
- `workspace` is the top-level loaded object in [client/App.tsx](../client/App.tsx).
- Upload flows already rebuild the app from the canonical workspace endpoint.

### Remaining non-canonical or mixed population paths

#### 1. Attribution view is still mixed

File: [client/views/attribution/AttributionView.tsx](../client/views/attribution/AttributionView.tsx)

Current state:

- Uses `analysisResponse` for monthly and period sheets.
- Still uses `sharedBackcast.series` for portfolio total-return range math.
- Still carries legacy naming that suggests attribution comes from a backcast stream rather than the workspace contract.

Known math defects in the same view:

- Waterfall currently ranks by weight instead of contribution.
- Sector period returns are added instead of compounded.
- Heatmap performance totals sum ticker returns across rows, which is not a valid portfolio return.

#### 2. Report view still uses backcast-derived attribution

File: [client/views/ReportView.tsx](../client/views/ReportView.tsx)

Current state:

- Performance chart and KPI usage from workspace performance variants is acceptable.
- Attribution table content still comes from `backcast.periodAttribution`.
- This bypasses the canonical workspace attribution sheet contract.

#### 3. App shell still exposes legacy prop semantics

File: [client/App.tsx](../client/App.tsx)

Current state:

- Workspace is loaded correctly.
- But child props still use names like `sharedBackcast`, which keeps the old mental model alive and makes mixed usage easier.

#### 4. Legacy client types and routes still need a sweep

Files:

- [client/types.ts](../client/types.ts)
- [client/services/api.ts](../client/services/api.ts)
- [client/vite.config.ts](../client/vite.config.ts)

Current state:

- Some legacy backcast/attribution structures still exist.
- They may still be needed temporarily, but should be removed once view migration is complete.

#### 5. Year handling is still hardcoded in multiple client paths

Files:

- [client/App.tsx](../client/App.tsx)
- [client/views/UploadView.tsx](../client/views/UploadView.tsx)
- [client/components/manual-entry/ManualEntryModal.tsx](../client/components/manual-entry/ManualEntryModal.tsx)
- [client/components/manual-entry/useManualEntryState.ts](../client/components/manual-entry/useManualEntryState.ts)
- [client/types.ts](../client/types.ts)
- [client/views/performance/PerformanceCharts.tsx](../client/views/performance/PerformanceCharts.tsx)
- [client/views/ReportView.tsx](../client/views/ReportView.tsx)
- [client/utils/dateUtils.ts](../client/utils/dateUtils.ts)
- [client/components/IndexPerformanceChart.tsx](../client/components/IndexPerformanceChart.tsx)

Current state:

- App-level year state is dynamic.
- Upload and manual-entry flows use year-window helpers instead of `2025` / `2026` branches.
- Performance and one-pager full-year logic now use a generic `FULL_YEAR` reporting mode.
- The remaining year-model cleanup is product-level, not hardcoded-calendar cleanup.

Audit verdict:

- The repo is not year-agnostic yet.
- 2026 issues are likely to show up as missing or partially applied logic because some screens still treat 2025 as the canonical full-year mode and 2026 as a special second branch.

#### 6. Canonical server timeline logic appears year-agnostic

Files:

- [server/services/period_normalizer.py](../server/services/period_normalizer.py)
- [server/services/workspace_service.py](../server/services/workspace_service.py)

Current state:

- Period normalization extends from actual input dates, month boundaries, and current day.
- Monthly periods are grouped from actual period end dates.
- Attribution sheets are serialized from the normalized period timeline, not from hardcoded year constants.

Audit verdict:

- The strongest evidence points to a client-side year-model problem, not to `build_portfolio_workspace(...)` being frozen to 2025.

## Target Architecture

### Attribution

Attribution views should consume:

- `workspace.attribution.items`
- `workspace.attribution.monthlySheet`
- `workspace.attribution.periodSheet`
- `workspace.attribution.monthlyPeriods`
- `workspace.attribution.periods`
- `workspace.attribution.portfolioMonthlyReturns`
- `workspace.attribution.portfolioPeriodReturns`
- `workspace.attribution.portfolioYtdReturn`

### Performance

Performance views should consume:

- `workspace.performance.defaultBenchmark`
- `workspace.performance.variants`
- `workspace.performance.rollingMetrics`

### Risk

Risk views should consume:

- `workspace.risk`

### Audit / trace tools

Audit screens and troubleshooting should consume:

- `workspace.audit`

## Work Plan

### Phase 1. Harden the app contract

Goal:

- Make workspace sections explicit in the app shell.
- Remove legacy prop naming that implies attribution comes from backcast-side state.

Tasks:

- Rename top-level derived props in `App.tsx` to workspace-specific names.
- Pass explicit workspace sections into child views.
- Update view prop interfaces accordingly.

Status: Completed

### Phase 2. Canonicalize Attribution view

Goal:

- Remove dependence on backcast-derived attribution logic.
- Keep only canonical workspace attribution inputs.

Tasks:

- Replace `sharedBackcast` range math with canonical workspace-derived totals.
- Fix waterfall ordering to use contribution.
- Fix sector return math to compound, not sum.
- Fix heatmap footer math so displayed total comes from a valid portfolio-level source.

Status: Implemented, pending runtime comparison

### Phase 3. Canonicalize Report view

Goal:

- Keep performance charting on workspace performance variants.
- Replace attribution tables with canonical workspace attribution tables.

Tasks:

- Remove `backcast.periodAttribution` table generation.
- Rebuild period attribution table data from workspace attribution monthly/period sheets.

Status: Pending

### Phase 4. Retire dead legacy paths

Goal:

- Remove client code that is no longer needed after the migration.

Tasks:

- Sweep unused legacy types.
- Sweep dead API helpers.
- Sweep stale proxy routes if unused.

Status: Pending

### Phase 5. Add regression coverage

Goal:

- Catch drift between canonical workspace outputs and UI-derived values.

Tasks:

- Add tests or invariants for attribution totals.
- Add snapshot-alignment checks against `computation_snapshot`.
- Add UI-level invariants for totals/denominators where practical.
- Add year-coverage invariants so the same workspace can be inspected for 2025, 2026, and future years without code edits.

Status: Pending

### Phase 6. Remove hardcoded year modes

Goal:

- Make year handling derive from workspace data instead of fixed 2025/2026 branches.

Tasks:

- Completed: `2025 | 2026` unions on the main app path were replaced with dynamic year handling.
- Completed: literal `'2025'` performance/report period modes were replaced with a year-generic full-year selector.
- Remove upload/manual-entry year-range forks and calculate date windows from selected year values directly.
- Make debug tooling emit workspace year coverage so future year regressions are visible immediately.

Status: Pending

## Progress Log

### 2026-04-03

- Startup stall root cause audited and fixed.
- Workspace build timing checkpoints added.
- Workspace autoload failure surfaced in UI.
- Performance timeline was moved closer to the canonical workspace boundary model.
- This audit document added.
- Phase 1 app-shell workspace contract hardening completed.
- Phase 2 attribution migration implemented:
  - Attribution view no longer depends on backcast series for totals
  - top contributor/disruptor tables now prefer canonical workspace layouts
  - overview totals now use canonical attribution-derived portfolio returns
  - period tables are filtered to the selected year

### 2026-04-04

- Year-specific audit completed.
- Conclusion: canonical server timeline construction is year-agnostic, and the main client year model is now off hardcoded `2025` / `2026` branches.
- `server/debug_dump_canonical_ticker.py` was upgraded to emit:
  - the ticker canonical CSV dump
  - a sidecar year-audit JSON summarizing workspace year coverage and known year-hardcoding findings
