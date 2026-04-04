# Computation System Reference

This folder is a static snapshot of the current computation path as of the latest stabilized state.

It exists for one reason: make the upcoming computation rewrite easier by freezing the current behavior, file set, and data flow in one place.

## Scope

Included files in this snapshot:

- `portfolio_returns.py`
- `data_loader.py`
- `cache_manager.py`
- `constants.py`
- `period_utils.py`
- `market_data.py`
- `report_engine.py`

These are the files that currently drive the computation path from workbook import through canonical report payload creation.

Not included:

- `excel_formatter.py`
- `monthly_sheet.py`
- `period_sheet.py`
- `top_contributors_sheet.py`

Those output files still matter to the full application, but they are intentionally excluded from this snapshot because this folder is focused on the compute side, not workbook rendering.

## Why This Folder Exists

The current codebase is in a transitional state:

- input loading was preserved
- output rendering was preserved
- the core math was rewritten around a chronological engine
- some legacy compatibility functions still exist beside the new path

That means there are now two different kinds of code in the repo:

1. code that is part of the canonical computation pipeline
2. code that still exists for compatibility or historical reasons

This snapshot isolates the first category so future work can be done against a stable reference.

## High-Level Runtime Flow

At runtime, the current path is:

1. `portfolio_returns.py`
2. `data_loader.py`
3. `report_engine.py`
4. `period_utils.py`
5. `market_data.py`
6. `cache_manager.py`
7. renderer modules consume the finished payload

Chronologically, the business flow is:

1. import Excel inputs
2. normalize imported dates
3. insert missing month-end boundaries
4. forward-fill weights to the expanded boundary set
5. resolve boundary prices
6. compute sub-period holding facts
7. roll those facts into period, monthly, quarter, and YTD views
8. build benchmark and portfolio rollups
9. build top-contributor layouts
10. hand the finished payload to the Excel layer

That order is now encoded in `build_report_payload()` in `report_engine.py`.

## File-by-File Responsibility

### `portfolio_returns.py`

This is the runtime entrypoint.

Its current responsibility is intentionally thin:

- load cache
- load normalized inputs
- call the engine once
- create the output workbook
- print the DYN245 audit trace when available

Important detail:

- output naming now uses the final expanded report boundary, not just the last raw imported date

That matters because the engine can extend the reporting window to month-end even when the raw workbook ends before month-end.

### `data_loader.py`

This file is the input boundary.

Current responsibilities:

- read the weights workbook
- read the NAV workbook
- validate the `Ticker` column exists
- parse date columns using `DD/MM/YYYY`
- normalize the imported date list
- package the result into `InputData`

Current canonical output type:

```python
InputData(
    weights: dict[str, dict[pd.Timestamp, float]],
    navs: dict[str, dict[pd.Timestamp, float]],
    imported_dates: list[pd.Timestamp],
)
```

Important behavior:

- weights are stored at their actual imported dates only
- forward-fill does not happen here
- NAV fallback does not happen here
- date normalization happens here, but time-series expansion does not

That separation is good and should be preserved.

### `cache_manager.py`

This file is not math-heavy, but it is part of the compute path because price and FX lookups depend on it.

Responsibilities:

- load cached market data from `.cache/market_data_cache.pkl`
- discard stale cache entries by whole-file age
- save the cache after a run

Important limitation:

- cache invalidation is file-level, not ticker/date-level
- the cache is simple and operational, not domain-aware

For the rewrite, this is probably acceptable to keep thin unless market-data fetch behavior becomes a bottleneck.

### `constants.py`

This file defines shared compute constants:

- cache location
- benchmark ticker map
- benchmark display order
- special cash ticker
- FX ticker

Important invariant:

- `$CASH$` is always treated as zero return and zero contribution

### `period_utils.py`

This file contains the mechanical time and compounding helpers used across the engine.

Core responsibilities:

- normalize dates
- build consecutive sub-periods
- insert month-end boundaries
- forward-fill weights over inserted boundaries
- group periods by reporting month
- build reporting month spans
- group months into quarter-sized blocks
- calculate geometric returns
- calculate forward-compounded contributions
- calculate portfolio-level span returns

This module is conceptually clean. It is low-level and should remain dependency-light.

The most important functions here are:

- `expand_dates_with_month_ends()`
- `expand_weights_dict()`
- `calculate_compound_return()`
- `calculate_forward_compounded_contribution()`

Those four functions are effectively part of the computational contract.

### `market_data.py`

This file owns price resolution and FX eligibility.

The current engine uses these parts of it:

- `needs_fx_adjustment()`
- `get_price_on_date()`
- `get_nav_price_on_or_before()`
- `resolve_price_on_date()`
- `get_fx_return()`

Important behavior:

- NAV-backed tickers do not get FX adjustment
- `.TO` tickers and `^GSPTSE` do not get FX adjustment
- everything else is treated as USD exposure and gets converted using `CAD=X`

Important NAV rule:

- exact NAV date is preferred
- otherwise the latest earlier NAV is used
- but only if it is within `NAV_LOOKBACK_WINDOW_DAYS = 10`

This is a meaningful business rule, not just a technical one.

The file still contains older functions like:

- `calculate_returns()`
- `calculate_benchmark_returns()`
- `build_results_dataframe()`

Those are now legacy-style helpers. The current engine path does not use them as its primary compute flow. They remain in the file for compatibility and historical reasons.

### `report_engine.py`

This is the current computation core.

This file now owns the real report logic.

Its job is to compute reusable facts once, then redistribute them into every downstream view.

That is the most important architectural shift in the current codebase.

## Canonical Engine Pipeline

### Stage 1: Timeline construction

`build_timeline(imported_dates)` produces `TimelineData`.

That object includes:

- imported dates
- expanded dates
- consecutive sub-periods
- reporting month keys
- month groups
- monthly spans
- quarter groups

This is the canonical temporal skeleton for the report.

Important consequence:

- every later calculation uses the same timeline
- month-end insertion happens once
- period grouping happens once

### Stage 2: Weight expansion

Inside `build_report_payload()`, weights are expanded with:

```python
expanded_weights = expand_weights_dict(input_data.weights, timeline.expanded_dates)
```

This means:

- holdings only need explicit weights on the dates the user provided
- inserted month-end boundaries inherit the most recent known weight
- weight filling is chronological and deterministic

This is why contribution can differ from raw full-period return: the held weight may change inside the month or quarter.

### Stage 3: Boundary price resolution

The engine builds a unified boundary-price map:

```python
prices = _build_price_map(expanded_weights, input_data.navs, timeline.expanded_dates, cache)
```

Rules:

- if ticker is NAV-backed, use NAV resolution
- otherwise use market price resolution
- `$CASH$` is skipped

This is important because later stages do not decide where prices come from. They just consume canonical resolved boundaries.

### Stage 4: FX stream

The engine precomputes FX returns per sub-period:

```python
fx_returns = _build_fx_return_map(timeline.periods, cache)
```

Then each holding decides whether to use them based on `needs_fx_adjustment()`.

Important nuance:

- FX returns are globally precomputed for the whole report
- MF holdings do not use them
- benchmarks do use the same FX stream where needed

### Stage 5: Canonical holding facts

This is the core ledger:

```python
holding_facts = _build_holding_facts(...)
```

Each row represents one ticker over one sub-period and includes:

- `Ticker`
- `PeriodIndex`
- `StartDate`
- `EndDate`
- `Weight`
- `PriceStart`
- `PriceEnd`
- `NeedsFx`
- `FxReturn`
- `Return`
- `Contrib`

This table is the source of truth for the rest of the report.

If the rewrite keeps only one central artifact, it should keep this idea.

### Stage 6: Wide period view

`_build_period_dataframe()` pivots `holding_facts` into the older wide layout:

- `Weight_0`, `Return_0`, `Contrib_0`
- `Weight_1`, `Return_1`, `Contrib_1`
- ...
- `YTD_Return`
- `YTD_Contrib`

This is mainly for compatibility with existing sheet rendering and portfolio-level aggregation.

The important point is that it is derived from canonical facts, not computed independently.

### Stage 7: Monthly view

`_build_monthly_dataframe()` groups sub-period facts into month spans.

For each ticker and month:

- month return = geometric compound of sub-period returns
- month contribution = forward-compounded contribution of the sub-period ledger inside that month

Then:

- monthly YTD return = compound of monthly returns
- monthly YTD contribution = forward-compounded contribution across all underlying facts

Again, the month view is derived from `holding_facts`, not recomputed from raw inputs.

### Stage 8: Portfolio rollups

Portfolio sub-period return is defined as:

```text
sum of holding contributions in that sub-period
```

Then:

- monthly portfolio return compounds the relevant sub-period portfolio returns
- YTD portfolio return compounds monthly portfolio returns

This means the portfolio rollup is anchored on contribution math, not on a separate position-level reconstruction.

### Stage 9: Benchmark rollups

Benchmarks are handled in a parallel stream:

- build benchmark boundary prices
- compute benchmark sub-period returns
- roll them into monthly returns
- roll them into YTD returns

Important distinction:

- benchmarks do not use holding weights
- benchmarks remain price-return series only
- they share the same timeline and same date boundaries

That makes benchmark comparisons structurally aligned with holding views.

### Stage 10: Top-contributor layouts

The engine now computes the data used by the top-contributor sheet.

It builds:

- month tables
- quarter table for each quarter block

Current behavior:

- a quarter table now appears as soon as that quarter has any populated month
- it no longer waits for a full three-month quarter to exist
- quarter label is derived from actual calendar quarter

Example:

- if April exists, Q2 appears immediately

This was a recent fix and is now part of current expected behavior.

### Stage 11: MF audit traces

The engine also produces deterministic mutual fund traces:

- raw NAV inputs
- reporting boundaries
- resolved boundary prices
- sub-period rows
- monthly rows
- quarter rows
- YTD row

The current runtime prints the `DYN245` trace automatically when available.

This trace is valuable because it lets you compare:

- imported NAV values
- boundary resolution behavior
- sub-period return math
- monthly/quarter/YTD rollups

without depending on the workbook view.

## The Most Important Mathematical Rules

### Holding return

For one sub-period:

```text
return = (end_price / start_price) - 1
```

If FX applies:

```text
cad_adjusted_return = (1 + local_return) * (1 + fx_return) - 1
```

### Holding contribution

For one sub-period:

```text
contribution = start_weight * sub_period_return
```

### Geometric span return

For a month, quarter, or YTD:

```text
(1 + r1) * (1 + r2) * ... * (1 + rn) - 1
```

### Forward-compounded span contribution

For a sequence of sub-periods:

```text
sum_t [ w_t * r_t * product_{s > t}(1 + r_s) ]
```

This is why:

- YTD contribution is not always the simple sum of monthly contributions
- quarter contribution is not always the simple sum of month contributions

Earlier contributions are restated on the final base of the span by compounding through later returns.

## Why DYN245 Was Important

DYN245 was used as the primary MF audit case because it exercised a non-trivial path:

- NAV-backed pricing
- no FX adjustment
- multiple sub-periods inside months
- changing weights inside March
- positive monthly contribution during a negative full-month return

That last case is especially important.

The March result for DYN245 is a good example of why full-month return and held contribution are not the same concept:

- the fund’s full March price move was negative
- but the portfolio cut the weight before the later losses
- therefore March contribution could still be positive

This is correct behavior if the sub-period ledger is correct.

## Current Strengths

The current compute path is materially better than the older one because:

- timeline expansion is centralized
- weight expansion is centralized
- price resolution is centralized
- contribution math is centralized
- month and quarter rollups are derived from the same canonical facts
- renderers are thinner than before
- MF auditability is much higher

## Current Weak Spots

This snapshot also makes the remaining technical debt visible.

### 1. `report_engine.py` is doing too much

It is better than the prior scattered logic, but it is still large.

It currently owns:

- timeline building
- holding facts
- monthly view building
- benchmark view building
- top-contributor view building
- MF audit trace building
- multiple compatibility helpers

This is workable, but it is not the final shape.

### 2. Compatibility helpers still live beside the new engine

Examples:

- `calculate_holding_span_returns()`
- `holding_facts_from_period_dataframe()`
- `build_span_summary_from_period_dataframe()`
- old functions still present in `market_data.py`

These are not inherently wrong, but they should eventually be separated from the pure core pipeline.

### 3. Quarter grouping still uses chunking by visible reporting months

The current implementation trims month reporting to the first January and then groups months into three-month blocks.

That works for the current report shape, but it is still presentation-aware.

If the rewrite becomes more formal, quarter identity should probably be represented as explicit calendar quarter metadata rather than inferred chunking.

### 4. Benchmark and FX precomputation are still broad

The engine precomputes FX for all sub-periods and benchmark prices for all boundaries.

That is acceptable right now, but it is still somewhat eager rather than demand-driven.

### 5. Input parsing is still simple

`data_loader.py` does not yet deeply validate:

- duplicate ticker/date combinations
- malformed percentage columns beyond the current conversion path
- inconsistent date columns between workbooks
- unexpected blank ticker rows

That is acceptable for now, but it is a likely area for future hardening.

## Recommended Rewrite Direction

If the next rewrite phase starts from this snapshot, the safest direction is:

1. keep `InputData` as the import contract
2. keep `TimelineData` as the reporting skeleton
3. keep `holding_facts` as the canonical ledger
4. split `report_engine.py` by stage rather than by sheet

Practical target split:

- `timeline_engine.py`
- `price_engine.py`
- `holding_engine.py`
- `rollup_engine.py`
- `benchmark_engine.py`
- `audit_engine.py`

The current renderer contract can stay stable while that refactor happens.

## Current Canonical Truths

These behaviors should be treated as the current contract unless intentionally changed:

- month-end boundaries are inserted chronologically
- weights are forward-filled onto inserted dates
- MF prices come from NAV data, not Yahoo Finance
- MF prices can use prior-date fallback within 10 days
- NAV-backed tickers do not get FX adjustment
- contribution is computed on held sub-period weights, not on full-period hindsight
- quarter tables appear as soon as their quarter has any populated month
- output filename date uses the final expanded report boundary

## How To Use This Folder

Use this folder as a rewrite reference, not as an import target.

That means:

- do not wire the app to import from these files
- use these copies as frozen reference material
- compare future refactors against this snapshot when behavior changes

If a later rewrite changes a number, the first question should be:

1. did the business rule change intentionally?
2. or did the canonical fact chain break?

This snapshot gives you a concrete baseline for answering that.
