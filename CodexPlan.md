# Tab-by-Tab Audit Roadmap

## Summary
- Treat each tab as a separate implementation slice with its own audit, fixes, naming cleanup, and regression checks.
- Keep `Data Import` as the canonical raw-input layer, and treat every other tab as a derived-data consumer.
- For every tab, do the same four-step pass: trace data lineage, verify calculations, improve naming where semantics are misleading, and lock regression checks before moving on.
- Keep a durable repo note during the work so future sessions can resume cleanly with current findings, decisions, and deferred issues.
- Current repo-state note: the Data Import and Holdings slices below are now implemented in the app. The remaining tabs in this roadmap are still pending.

## Completed In App
- Data Import: mutual-fund NAV lag now groups by each fund's own latest held date, the recency card uses the same active-MF helper, and the backend requires an explicit `reference_date`.
- Data Import: manual-entry deletes now clear the ticker from every period weight map, and failed portfolio-config saves no longer auto-submit or close the modal.
- Holdings: beta/dividend terminology now distinguishes portfolio beta from market beta and portfolio dividend yield from holding-level yield.
- Holdings: the Holdings table now uses direct-stock market beta only, positive dividend yield only, and the resolved geo override map.

## Shared Audit Pattern
- Create one living audit ledger document for the project. Each tab gets: purpose, source of truth, derived data used, invariants, known issues, changes made, and deferred items.
- Add one reusable "data lineage" checklist used on every tab: source input, backend endpoint or cache used, client transform layer, displayed values, and cross-tab dependencies.
- Add one reusable "naming review" pass on every tab. Only rename code symbols, comments, labels, or helper names when the current term is mathematically or conceptually misleading.
- Add one reusable regression pass on every tab. For each fixed metric or table, verify the same value in all tabs that consume it.
- Cleanup rule for the next session: start from a clean worktree, then re-apply only the scoped changes listed in this document. Do not carry over the current mixed UI/layout edits.

## Per-Tab Plans

### 1. Data Import
- Status: completed in app.
- Audit the full canonical-input path: manual entry state, saved config, sector-weight persistence, geo persistence, NAV uploads, lag checks, and the analysis trigger path.
- Verify that raw user input remains the source of truth and is not silently overwritten by derived analysis rows.
- Fix the `Data Recency` logic so each mutual fund is evaluated against its own last-held date, not a shared portfolio-wide date.
- Review naming around "asset completion," "data recency," "lag," and "last NAV data" so the UI and code both describe the same rule.
- Acceptance for this slice: a valid portfolio definition with complete sector, geo, and MF NAV inputs unlocks downstream tabs; the recency indicator matches the per-MF rule you defined.
- Implemented in app:
- [client/views/UploadView.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\views\UploadView.tsx): added helpers for latest ticker records and active mutual funds, grouped lag checks by each fund's own latest held date, and reused the same helper in the `Data Recency` card.
- [server/routes/config.py](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\server\routes\config.py): `check_nav_lag` now requires a valid `reference_date` and returns `400` if it is missing or malformed.
- [client/components/manual-entry/useManualEntryState.ts](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\components\manual-entry\useManualEntryState.ts): removing a ticker also removes its weights from every period, and failed saves now stop the submit flow.
- Re-audit note: the Data Import foundation is now aligned with the intended source-of-truth model.

### 2. Holdings
- Status: completed in app.
- Audit every KPI against its true source, with special focus on `Beta` and `Div Yield`.
- Verify the "Actual Top 10 - Historical Weights" chart uses the intended top-10-through-time behavior and does not drift from the portfolio history model.
- Verify benchmark deviation and regional sector tilt both use the same benchmark composition as `Index Breakdown`.
- Verify the holdings breakdown table preserves the intended rules: stocks map to one sector at 100%, ETFs and MFs use look-through sector weights from `Data Import`, and geo overrides behave consistently.
- Improve naming only where the metric semantics are wrong or ambiguous, especially for portfolio beta versus per-security beta.
- Acceptance for this slice: all displayed weights reconcile to the latest snapshot, benchmark comparison matches `Index Breakdown`, and `Beta` and `Div Yield` are explicitly correct and consistently defined.
- Implemented in app:
- [client/views/DashboardView.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\views\DashboardView.tsx): the dashboard now tracks `marketBetaMap`, `marketDividendYieldMap`, and `portfolioBeta` separately, fetches market beta only for direct equities, resets derived market data on reload, and passes the resolved geo map into the holdings table.
- [client/views/DashboardView.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\views\DashboardView.tsx): the KPI card labels now distinguish portfolio beta vs benchmark from portfolio dividend yield.
- [client/components/PortfolioTable.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\components\PortfolioTable.tsx): the holdings table now uses `Market Beta` and `Market Div %`, shows beta only for direct equities, and hides missing/zero dividend yields.
- Re-audit note: Holdings semantics now line up with the intended source data and benchmark interpretation.

### 3. Index Breakdown
- Audit the benchmark-composition pipeline end to end: XIC/ACWI composition retrieval, cached benchmark data, composite weighting, sector mapping, geography mapping, and currency mapping.
- Verify that the benchmark used here is identical to the benchmark used in Holdings deviation and Relative Performance.
- Audit the performance series for ACWI, XIC.TO, and the composite benchmark, including CAD conversion and proxy handling.
- Audit the currency-exposure table so the weights and performance columns reflect the intended geography-to-currency model.
- Improve naming around "Index," "Composite," and benchmark labels so the benchmark identity is unmistakable everywhere.
- Acceptance for this slice: sector, geography, performance, and currency views all reconcile to the same fixed `75/25` benchmark definition.

### 4. Return Contribution
- Audit the attribution pipeline from portfolio history into monthly rows, quarterly summaries, waterfall outputs, and total rows.
- Document the exact math used today for contribution, return chaining, compounding, and any forward-compounded logic so the current mismatch is explicit before changing behavior.
- Decide and implement one consistent attribution model for monthly and total rows. The likely default is to make period rows and totals reconcile under the same compounding convention rather than mixing constant-weight and compounded totals.
- Audit benchmark-mode toggles in the attribution deep-dive container so the comparison basis is clearly defined and consistently applied.
- Improve naming where "contribution," "return," "weight," "YTD," or "total" currently imply a different math basis than the code actually uses.
- Acceptance for this slice: waterfall, tables, heatmap totals, and YTD total rows are mathematically coherent and clearly labeled.

### 5. Risk Contribution
- Do a lower-priority audit of the existing metrics rather than redesigning the tab.
- Verify portfolio volatility, beta, diversification ratio, effective bets, VaR/CVaR, MCTR, component risk, and risk-vs-weight columns against the backend formulas.
- Check that risk table naming matches the actual math, especially for `beta`, `mctr`, `pctOfTotalRisk`, and `riskAdjustedReturn`.
- Check consistency between position-level risk data, sector risk rollups, and the correlation matrix.
- Acceptance for this slice: the tab remains visually unchanged but metric definitions are trustworthy and naming is not misleading.

### 6. Relative Performance
- Audit the shared backcast/performance dataset, benchmark selection logic, period filters, and chart transformations for `absolute`, `relative`, and `drawdowns`.
- Verify the chart modes and KPI block are driven by the same underlying series and period cutoffs.
- Check that benchmark switching produces mathematically consistent charts and metrics, and that the default `75/25` mode matches `Index Breakdown`.
- Improve naming where chart mode labels, benchmark labels, or KPI names could mislead interpretation.
- Acceptance for this slice: every displayed KPI can be traced directly to the active chart series and selected benchmark.

### 7. One Page
- Treat this as a consistency and packaging audit, not a new computation layer.
- Verify that every panel on the one-pager matches the source tab's audited data after upstream fixes are in place.
- Remove any duplicate transformations inside the report tab that could create drift from the source views.
- Improve only labels or section names that misrepresent the source metric; leave layout unchanged unless a data inconsistency forces a presentation change.
- Acceptance for this slice: the one-pager is a faithful summary of already-audited source tabs and introduces no independent math drift.

## Test Plan
- Build one stable portfolio fixture for audit work. Use the same saved config and current cached benchmark data across all tab audits so values can be compared repeatably.
- For `Data Import`, test: ETF with sector weights only, MF with current NAV, MF with stale NAV, stock-only portfolio, and mixed geo overrides.
- For `Holdings`, test: weight totals, sector totals, geo totals, benchmark deviation reconciliation, beta meaning, and dividend-yield rollup.
- For `Index Breakdown`, test: benchmark weights sum to the intended mix, geography and sector totals are internally consistent, and performance series match the same benchmark used elsewhere.
- For `Return Contribution`, test: monthly rows, quarterly rows, waterfall totals, heatmap totals, and YTD totals on the same portfolio so reconciliation is explicit.
- For `Risk Contribution`, test: position risk sums, sector risk sums, portfolio-level risk KPIs, and correlation-matrix membership.
- For `Relative Performance` and `One Page`, test: chart/KPI consistency, benchmark switching, period filtering, and cross-tab value matching against source views.

## Assumptions
- Layout and visual structure stay mostly fixed; this roadmap is for data correctness, semantics, and naming clarity.
- Each tab audit is implemented as its own self-contained slice, with its own findings and fixes, but `One Page` should be done only after the upstream source tabs it summarizes are audited.
- Shared benchmark identity stays fixed at `75% ACWI + 25% XIC.TO` unless you explicitly change the product definition later.
- `Data Import` is the canonical foundation for the rest of the app.
- Files currently carrying mixed or likely throwaway edits that should be discarded before continuing: [client/components/PortfolioEvolutionChart.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\components\PortfolioEvolutionChart.tsx), [client/components/SectorDeviationCard.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\components\SectorDeviationCard.tsx), [client/views/performance/UnifiedPerformancePanel.tsx](c:\Users\Phili\Desktop\Local_GitHub\fullstack-ptf-V2\client\views\performance\UnifiedPerformancePanel.tsx), and `server/routes/__pycache__/config.cpython-314.pyc`.
