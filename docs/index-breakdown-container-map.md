# Index Breakdown Tab Audit

Updated: 2026-04-08

## Goal

Audit how the live `Index Breakdown` tab is populated today, and identify where it is:

- on the shared canonical workspace path
- using separate benchmark-only server branches
- recomputing values locally in the client
- carrying stale or dead code

## Expected Canonical Spine

The app shell already builds one shared workspace and redistributes it:

- `client/App.tsx`
  - `fetchPortfolioWorkspace(...)`
  - stores `workspace`
  - redistributes `workspace.attribution`, `workspace.performance`, and `workspace.risk`

That is the canonical app-level data spine.

## Actual Live Entry Path

The `Index Breakdown` tab does not consume that spine.

- `client/App.tsx`
  - mounts `<IndexView />` directly
  - does not pass `workspace`, `attributionData`, or `performanceVariant` into it
- `client/views/IndexView.tsx`
  - independently calls:
    - `fetchIndexExposure()`
    - `fetchCurrencyPerformance(...)`
    - `fetchIndexHistory()`

Verdict:

- The whole `Index Breakdown` tab is outside the canonical workspace pathway today.

## Load Flow

`IndexView` uses three independent fetch branches and stores them in local component state:

- `exposure`
- `currencyPerf`
- `indexHistory`
- `fetchedAt`

Important detail:

- `fetchedAt` is set to `new Date().toISOString()` when the client finishes loading.
- It does not use server source timestamps like `last_scraped`.

So the freshness badge reflects client load time, not data-source freshness.

## Container Map

### 1. Composite Performance

Client path:

- `client/views/IndexView.tsx`
  - `indexHistory`
  - `<IndexPerformanceChart data={indexHistory} />`
- `client/components/IndexPerformanceChart.tsx`

Server source:

- `client/services/api.ts`
  - `fetchIndexHistory()`
- `server/routes/index.py`
  - `GET /index-history`

How it is built:

1. `GET /index-history` downloads `ACWI`, `XIC.TO`, and `USDCAD=X` from yfinance.
2. The route converts `ACWI` into CAD with `ACWI * USDCAD`.
3. The route creates a synthetic `Index` series from daily returns:
   - `75% ACWI (CAD) + 25% XIC.TO`
4. The client then:
   - filters by the selected period
   - normalizes all series to start at 0%
   - recomputes summary performance cards from the filtered chart

Verdict:

- Not canonical.
- It is a separate benchmark-history branch built directly in `server/routes/index.py`, not from `workspace.performance` or `workspace.attribution.dailyPerformanceSeries`.

Lean-code notes:

- The server already computes the benchmark series, but the client recomputes period-normalized chart values and annualized return cards locally.
- `IndexPerformanceChart` still exposes a hardcoded `2025` period button.

### 2. Sector Exposure

Client path:

- `client/views/IndexView.tsx`
  - `<ClevelandDotPlot data={exposure.sectors} />`

Server source:

- `client/services/api.ts`
  - `fetchIndexExposure()`
- `server/routes/index.py`
  - `GET /index-exposure`
- `server/index_scraper.py`
  - `scrape_index_data()`

How it is built:

1. `GET /index-exposure` loads `data/index_exposure.json`.
2. If the file is stale, it re-runs `scrape_index_data()`.
3. The route combines scraped ACWI and TSX sector weights into:
   - `Index = 0.75 * ACWI + 0.25 * TSX`

Verdict:

- Not canonical.
- This is a scraper/file-cache branch, completely separate from the portfolio workspace.

### 3. Geographic Breakdown

Client path:

- `client/views/IndexView.tsx`
  - `geoMapData = exposure.geography`
  - `<WorldChoroplethMap data={geoMapData} />`

Server source:

- same `GET /index-exposure` branch as Sector Exposure

How it is built:

- Geography weights come from the same scraped `index_exposure.json` file and the same 75/25 recombination logic.

Verdict:

- Not canonical.

### 4. Currency Exposure

Client path:

- `client/views/IndexView.tsx`
  - `currencyExposure`
  - `currencyRows`
  - table rendering with `currencyPerf[ticker]`

Server sources:

- exposure weights:
  - derived locally from `exposure.geography`
- performance columns:
  - `client/services/api.ts`
    - `fetchCurrencyPerformance(...)`
  - `server/routes/market.py`
    - `POST /fetch-performance`

How it is built:

1. The tab derives currency weights locally from geography using `COUNTRY_CURRENCY_MAP`.
2. It then calls `POST /fetch-performance` for only:
   - `USDCAD=X`
   - `JPYCAD=X`
   - `EURCAD=X`
3. The table maps displayed currencies back to those tickers with `CURRENCY_CODE_TO_TICKER`.

Verdict:

- Not canonical.
- Mixed source even inside the same panel:
  - weights come from index-exposure geography
  - performance comes from the generic market-performance route

Lean-code notes:

- There is an index-specific server route, `POST /currency-performance`, but the client does not use it.
- The live implementation only fetches FX performance for `USD`, `JPY`, `EUR`, and hardcodes `CAD = 0`.
- `COUNTRY_CURRENCY_MAP` includes other currencies like `GBP`, `CHF`, `AUD`, `CNY`, `TWD`, and `INR`, but those have no performance feed in the table today.

### 5. Refresh Button

Client path:

- `client/views/IndexView.tsx`
  - `handleRefresh()`

Server source:

- `server/routes/index.py`
  - `POST /index-refresh`

How it is built:

1. Re-runs the scraper for exposure data.
2. Deletes the cached `index_history_cache.json`.
3. Reloads the tab.

Verdict:

- Not canonical.
- This refresh path only updates the benchmark-side scraper/history branch.

## Current Live Verdict By Container

- Composite Performance: non-canonical
- Sector Exposure: non-canonical
- Geographic Breakdown: non-canonical
- Currency Exposure: non-canonical and mixed
- Refresh action: non-canonical

Bottom line:

- No visible container in the `Index Breakdown` tab is currently plugged into the shared canonical workspace pathway.

## Stale Or Dead Code Found

### 1. Unused server route

File:

- `server/routes/index.py`

Finding:

- `POST /currency-performance` exists, but I could not find a live client consumer.
- `IndexView` uses `POST /fetch-performance` from `server/routes/market.py` instead.

### 2. Unused client fields from index exposure response

File:

- `client/views/IndexView.tsx`

Fields:

- `raw`
- `last_scraped`

Finding:

- They are typed on the client response object, but not used by the rendered tab.

### 3. Dead sunburst preparation code

File:

- `client/views/IndexView.tsx`

Finding:

- `COUNTRY_MARKET_CLASS`
- `MARKET_COLORS`
- `sunburstSegments`

are defined/computed, but not rendered anywhere in the current tab.

### 4. Misleading freshness behavior

File:

- `client/views/IndexView.tsx`

Finding:

- The freshness badge uses client load time, not source freshness.
- The exposure API already returns `last_scraped`, but the tab ignores it.

### 5. Hardcoded legacy year branch

File:

- `client/components/IndexPerformanceChart.tsx`

Finding:

- The chart still has a hardcoded `2025` period mode.

## What To Refactor First

### Priority 1

Decide whether `Index Breakdown` should join the canonical workspace or remain intentionally benchmark-only.

Reason:

- Right now it is a full sidecar system with its own routes, cache files, freshness logic, and client transforms.

### Priority 2

If the tab should be canonical, move benchmark composition and benchmark history into one shared workspace slice.

Reason:

- That would remove the separate `IndexView -> api.ts -> routes/index.py -> scraper/cache` pipeline.

### Priority 3

Unify currency exposure onto one source.

Reason:

- The current panel mixes geography-derived weights with generic market-performance fetches.
- It also only supports a partial currency set.

### Priority 4

Delete stale branches once the target path is chosen.

Targets:

- unused `POST /currency-performance`
- unused `raw` and `last_scraped` client fields if not needed
- dead sunburst prep code
- hardcoded `2025` period branch

## Bottom Line

The `Index Breakdown` tab is not on the canonical workspace path today.

It is populated by a separate benchmark subsystem:

- scraper-backed exposure data from `index_exposure.json`
- ad hoc yfinance history from `GET /index-history`
- generic FX performance from `POST /fetch-performance`
- local client recomputation for currency weights, chart normalization, and performance cards

If the goal is one lean trusted pipeline, this tab is still a full exception.
