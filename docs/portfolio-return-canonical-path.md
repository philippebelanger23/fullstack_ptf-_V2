# Portfolio Return Canonical Path

Updated: 2026-04-08

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

The next optional cleanup is smaller:

- the server now owns named window boundaries through `workspace.performance.variants[benchmark].windowRanges`
- the client still slices chart series locally for rendering, but it now uses server-owned window boundaries rather than client-owned date rules
