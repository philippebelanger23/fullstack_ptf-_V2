# Return Contribution Tab Audit

Updated: 2026-04-08

## Goal

Audit how the live Return Contribution surfaces are populated today, and identify where the app is:

- fully on the canonical workspace path
- mixing canonical data with local recomputation
- still using older non-canonical server branches
- carrying stale or dead code

## Canonical Spine

The live app boots from one shared workspace request:

- `client/App.tsx`
  - `fetchPortfolioWorkspace(...)`
  - stores `workspace`
  - passes `workspace.attribution` into attribution-specific consumers
  - passes `workspace.performance` into performance consumers and the attribution heatmap footer/freshness path
- `client/services/api.ts`
  - `POST /portfolio-workspace`
- `server/routes/portfolio.py`
  - `portfolio_workspace(...)`
- `server/services/workspace_service.py`
  - `build_portfolio_workspace(...)`

That is the canonical entry path.

## Server Data Sources That Matter

Inside `build_portfolio_workspace(...)`, there are two distinct calculation worlds:

### 1. Canonical daily-chain path

Built from `performance.variants["75/25"].periodAttribution`, which comes from:

- `server/services/performance_service.py`
  - `compute_period_attribution(...)`

Downstream canonical attribution structures are built from that stream:

- `_build_canonical_top_contributors(...)`
- `_build_canonical_period_sheet(...)`
- `_build_canonical_monthly_sheet(...)`
- `_build_canonical_portfolio_period_returns(...)`
- `_build_canonical_portfolio_monthly_returns(...)`
- `_build_canonical_waterfall_for_range(...)`

### 2. Boundary-price holding facts path

Built from:

- `_build_holding_facts(...)`

This path uses start/end boundary prices or NAVs directly per period and produces:

- `holdings.periodItems`
- `holdings.items`

This path is still live.

## Container Map

### 1. Contribution Waterfall (Return Contribution tab, Overview mode)

Client path:

- `client/views/attribution/AttributionView.tsx`
  - `selectedOverviewLayout`
  - `canonicalWaterfallLayout`
  - `<WaterfallChart ... />`

Server source:

- `workspace.attribution.overviewLayouts[year][range].waterfall`

How it is built:

- `_build_attribution_overview_layouts(...)`
- `_build_canonical_waterfall_for_range(...)`

The waterfall is now built directly from canonical `periodAttribution` plus canonical performance `series`.

Verdict:

- Canonical.

Lean-code note:

- The old server patch layer and client waterfall rewrite were removed.

### 2. Attribution Analysis (selection / allocation / interaction bars)

Client path:

- `client/views/attribution/AttributionView.tsx`
  - `selectedOverviewLayout`
  - `canonicalSectorAttributionData`
  - `<SectorAttributionCharts ... />`

Server source:

- `workspace.attribution.overviewLayouts[year][range].sectorAttribution[region][benchmark]`

How it is built:

- `_build_attribution_overview_layouts(...)`
- `_build_canonical_span_summary_rows(...)`
- `_build_sector_attribution_layout(...)`

Important detail:

- `_build_canonical_span_summary_rows(...)` reads from canonical `periodAttribution`.
- The panel is now built after performance so it can consume the canonical attribution stream directly.

Verdict:

- Canonical.

Lean-code note:

- This was the main live divergence and is now aligned with the same attribution engine as the waterfall and tables.

### 3. Heatmap

Client path:

- `client/views/attribution/AttributionView.tsx`
  - `buildCanonicalMonthlyHistory(...)`
  - `buildAttributionTickerStats(...)`
  - `buildAttributionMatrixData(...)`
  - `<HeatmapSection ... />`

Primary data source:

- `workspace.attribution.monthlySheet`
- `workspace.attribution.monthlyPeriods`

Supporting sources:

- `workspace.attribution.periodItems` or `items` for weight snapshots and mutual-fund partial flags
- `workspace.performance.portfolio.monthlyReturns` for footer performance values
- `workspace.attribution.overviewLayouts[year][range].waterfall.portfolioReturn` for total return

How it works:

- Return and contribution cells come from canonical `monthlySheet`, which is built from canonical `periodAttribution`.
- Weight and partial-status decorations are reconstructed from `periodItems/items`, which come from `holding_facts`.
- The matrix itself is recomputed in the client from canonical monthly rows.

Verdict:

- Mostly canonical for return and contribution math.
- Mixed for display metadata because weights come from `periodItems/items`.
- More client recomputation than necessary.

Lean-code note:

- The core numbers are on the right path.
- The client is still rebuilding matrix rows and totals locally instead of consuming a server-built layout.

### 4. Tables view in Attribution tab

Current live UI:

- `client/views/attribution/AttributionView.tsx`
  - `buildCanonicalContributorPages(...)`
  - `<CanonicalContributorPagesSection ... />`

Server source:

- `workspace.attribution.topContributors`

How it is built:

- `_build_canonical_top_contributors(...)`
- source is canonical `periodAttribution`

Verdict:

- Canonical.

Important current-state note:

- The live Tables view renders top contributor/disruptor pages.
- The matrix table component exists in the file, but it is not mounted anywhere.

### 5. Relative Performance tab

Client path:

- `client/views/performance/PerformanceView.tsx`
- `client/selectors/performanceSelectors.ts`
  - `buildPerformanceSeries(...)`
  - `buildChartDataFromSeries(...)`

Server source:

- `workspace.performance.variants[...]`

Verdict:

- Canonical.

Lean-code note:

- This consumer now reads directly from the performance owner instead of attribution-carried copies.

### 6. One-pager report performance and attribution

Client path:

- `client/views/ReportView.tsx`
  - `buildPerformanceSeries(...)`
  - `buildOnePagerAttributionItems(...)`

Server source:

- performance chart: `workspace.performance.variants["75/25"].series`
- attribution card: `workspace.attribution.periodSheet`

Verdict:

- Canonical.

Important current-state note:

- The older orphaned-prop concern is gone.
- `ReportView` now actively consumes `attributionData`.

## Current Live Verdict By Surface

- Waterfall: canonical.
- Attribution Analysis: canonical.
- Heatmap: canonical for return/contribution math, mixed for display metadata, locally rebuilt.
- Tables view: canonical.
- Relative Performance: canonical.
- One-pager performance and attribution: canonical.

## Stale Or Dead Code Found

### 1. Unused canonical matrix utilities

File:

- `client/selectors/attributionSelectors.ts`

Unused exports:

- `buildCanonicalMonthlyMatrixTable(...)`
- `buildCanonicalPeriodMatrixTable(...)`

I could not find a live consumer for them.

### 2. Unmounted matrix table component

File:

- `client/views/attribution/AttributionView.tsx`

Component:

- `CanonicalMatrixTable`

It is defined, but not rendered anywhere in the current view tree.

### 3. Stale backend docs and comments

Files:

- `server/README.md`
- `server/services/performance_service.py`

Findings:

- `server/README.md` still documents `POST /analyze-manual`.
- I could not find a live router for `/analyze-manual` in `server/routes/` or `server/main.py`.
- `performance_service.py` docstrings and comments still describe compatibility with `run_portfolio_analysis` and `/analyze-manual`.

Verdict:

- These are stale references to an older mental model.

### 4. Removed copied performance payload from attribution

The app no longer carries these fields under `workspace.attribution`:

- `dailyPerformanceSeries`
- `portfolioPeriodReturns`
- `portfolioMonthlyReturns`
- `portfolioYtdReturn`
- `performanceFetchedAt`
- `performanceErrors`
- unused benchmark return arrays

Current state:

- `AttributionView` reads freshness and monthly portfolio footer values from `workspace.performance`
- Relative Performance and the one-pager performance chart also read `workspace.performance`

## What To Remove Or Refactor First

### Priority 1

Decide whether matrix tables are still part of the product.

If yes:

- mount the canonical matrix components and delete the ad hoc heatmap-matrix recomputation where possible

If no:

- remove `CanonicalMatrixTable`
- remove `buildCanonicalMonthlyMatrixTable(...)`
- remove `buildCanonicalPeriodMatrixTable(...)`

### Priority 2

Delete or rewrite stale legacy references.

Targets:

- `server/README.md`
- stale `/analyze-manual` references in comments and docstrings

## Bottom Line

The Return Contribution path is now on one shared attribution spine:

- Waterfall, Attribution Analysis, tables, relative performance, and one-pager attribution are canonical.

The next cleanup is no longer a live math mismatch or an ownership mismatch. It is mostly about removing stale legacy references and any remaining unnecessary client-side reshaping.
