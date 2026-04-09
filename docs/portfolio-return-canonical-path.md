# Portfolio Return Canonical Path

Updated: 2026-04-09

## Goal

Give portfolio return one canonical owner so every consumer reads the same computed data and the app does not hide performance state inside attribution.

## Current State

Portfolio return is now owned by `workspace.performance`.

Current performance shape:

- `workspace.performance.portfolio.periodReturns`
- `workspace.performance.portfolio.monthlyReturns`
- `workspace.performance.portfolio.ytdReturn`
- `workspace.performance.variants[benchmark].windows[period]`
- `workspace.performance.variants[benchmark].series`
- `workspace.performance.variants[benchmark].metrics`
- `workspace.performance.variants[benchmark].fetchedAt`

Canonical window semantics:

- KPI windows are anchored to the boundary close, not by counting the boundary-day return inside the period
- KPI windows are anchored to the latest available canonical performance date, not wall-clock time
- report labels and one-pager period slices now read the same server-owned `windowRanges`

`workspace.attribution` no longer carries copied performance fields such as:

- `dailyPerformanceSeries`
- `portfolioPeriodReturns`
- `portfolioMonthlyReturns`
- `portfolioYtdReturn`
- `performanceFetchedAt`
- `performanceErrors`
- benchmark return arrays that were not consumed by the live app

## Live Consumers

### Relative Performance tab

- `client/views/performance/PerformanceView.tsx`
- reads `workspace.performance.variants[...]`
- reads selected-period KPI windows from `workspace.performance.variants[benchmark].windows`

### One-pager performance container

- `client/views/ReportView.tsx`
- reads `workspace.performance.variants["75/25"]`

### Attribution heatmap footer and freshness badge

- `client/views/attribution/AttributionView.tsx`
- reads `workspace.performance.portfolio.monthlyReturns`
- reads `workspace.performance.variants[defaultBenchmark].fetchedAt`

The attribution tab still owns attribution math and layouts. It only reaches into performance for portfolio-level return metadata.

## Why This Is Better

- daily portfolio performance is computed once on the server
- monthly and period return maps are derived once from the canonical performance series
- attribution no longer acts as a hidden transport layer for performance data
- the client now does presentation shaping, not ownership-level return wiring

## Remaining Optional Work

The main ownership cleanup is complete.

One optional cleanup remains:

- if we want to reduce client presentation logic further, we can pre-emit chart-ready window labels from the server, but ownership and boundary math are already canonical today
