# Return / Contribution Masterplan

## Purpose
This document is the living source of truth for fixing the portfolio weight, performance, and contribution pipeline in a stepwise way.

The goal is to match the original `Return_Contribution_Python/` behavior while keeping the current app stable during migration. The plan is intentionally incremental: normalize dates once, compute returns and contributions once, then distribute the same canonical data to every consumer.

## Current Situation

### What already exists in the app
- `server/routes/portfolio.py` already injects month-end boundaries and carries weights forward across synthetic dates.
- `server/market_data.py` already computes period returns, period contributions, monthly rollups, and YTD contribution logic.
- `server/services/backcast_service.py` already computes daily backcast returns and period attribution for the performance views.
- `client/App.tsx` already merges backcast attribution into `portfolioData` so multiple views can share a single data source.

### Why the problem still exists
- There are still multiple calculation surfaces.
- Date normalization is not treated as one canonical primitive everywhere.
- Performance, attribution, and table views can still drift if any consumer re-derives periods or contributions differently.
- The app needs one computation block that every view reads from, instead of repeating logic per tab.

### Reference truth
- `Return_Contribution_Python/` is the golden reference for math and period behavior.
- `Return_Contribution_Python/CALCULATION_ENGINE.md` is the main arithmetic reference.
- `starter.md`, `mind map.md`, and `plan to apply.md` describe the desired app behavior and the view-level dependencies.

## Canonical Architecture

### 1. Normalize dates once
Create one backend period-normalization layer that:
- accepts raw rebalance dates from manual entry
- inserts missing month-end boundaries
- carries forward the previous weight onto synthetic month-end dates
- preserves the rule that the first period uses the prior month-end when needed

This layer becomes the only source of period boundaries for attribution and rollups.

### 2. Compute once
Build one canonical attribution engine that:
- computes holding return as `price_end / price_start - 1`
- applies FX adjustment only when required
- computes contribution as `weight x return`
- computes YTD contribution as a forward-compounded sum
- reuses the same normalized sub-period chain for monthly rollups

### 3. Distribute everywhere
All views should consume the same computed bundle, not recalculate the math locally.

Primary consumers:
- Holdings waterfall
- Attribution Analysis tables
- Attribution heatmap
- Contributors tables toggle
- Relative Performance graph
- One Page performance and contributors cards

## Stepwise Rollout

### Phase 1 - Lock the period model
1. Extract a single backend date-normalization helper.
2. Make `analyze-manual` call that helper before any return calculation.
3. Ensure synthetic month-end dates inherit the prior weight snapshot.
4. Keep output shapes unchanged while the normalization logic is centralized.

Success criteria:
- the same input dates always produce the same normalized period list
- missing month-ends are inserted automatically
- no downstream code invents its own date boundaries

### Phase 2 - Centralize the math
1. Move return and contribution arithmetic into one pure calculation module.
2. Reuse that module from period attribution and monthly rollups.
3. Preserve current API payloads so the UI does not need a big rewrite.
4. Keep cash, mutual fund NAV, and CAD vs USD rules explicit in the shared engine.

Success criteria:
- period returns match the original Python project
- contribution equals `weight x return` at the sub-period level
- YTD contribution matches the forward-compounded formula

### Phase 3 - Unify consumers
1. Point all attribution tables and charts at the shared canonical response.
2. Keep `BackcastResponse` as the performance source for the performance graph and KPI cards.
3. Make the holdings, attribution, relative performance, and one-pager views consume the same portfolio truth.
4. Remove any local re-derivation that can drift from the canonical bundle.

Success criteria:
- the same portfolio shows the same performance and contribution values everywhere
- tables, graphs, and summary cards agree on total return and contribution totals

### Phase 4 - Validate against the Python reference
1. Build a comparison fixture from the original Python project.
2. Compare normalized periods, period returns, period contributions, YTD return, YTD contribution, and monthly rollups.
3. Keep the comparison harness small and repeatable so changes can be verified after each slice.

Success criteria:
- every migrated calculation can be checked against `Return_Contribution_Python/`
- discrepancies are isolated to one slice at a time

## Implementation Rules

- Do not rewrite the whole pipeline at once.
- Compute a value once, then reuse it across the app.
- Treat backend date normalization as authoritative.
- Preserve existing response shapes unless a shape change is required for correctness.
- Prefer pure helper functions where possible so each step is easy to test.
- Keep view changes thin: the UI should mostly consume already-computed values.

## Test Plan

### Date normalization
- first date inside a month
- missing month-end between two rebalance dates
- multi-month gaps
- carried-forward weights on synthetic dates

### Return and contribution math
- constant weights
- changing weights
- cash rows
- mutual fund NAV rows
- CAD vs USD adjustment behavior

### Parity checks
- period returns against `Return_Contribution_Python/`
- period contributions against `Return_Contribution_Python/`
- YTD return against `Return_Contribution_Python/`
- YTD contribution against `Return_Contribution_Python/`
- monthly rollups against `Return_Contribution_Python/`

### Integration checks
- `/analyze-manual`
- `/portfolio-backcast`

### View smoke tests
- Holdings waterfall
- Attribution Analysis tables and heatmap
- Contributors toggle tables
- Relative Performance graph
- One Page performance and contributors cards

## Assumptions

- `Return_Contribution_Python/` remains the reference implementation for calculation truth.
- Backend normalization is the single authoritative source for period boundaries.
- The app should be migrated incrementally, not rewritten in one pass.
- Visual layout stays stable while the data pipeline is corrected.
- Existing API response shapes should be preserved unless a change is required for correctness.

## Living Notes

- This document should be updated as each phase is completed.
- Any future calculation change should state whether it affects date normalization, arithmetic, response shaping, or only presentation.
- If a view needs special handling, it should consume the canonical bundle first and only transform for display.
