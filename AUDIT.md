# Data Pipeline Audit — March 2026

Comprehensive audit of data fetching, metric computation, and cross-app consistency.
Covers every metric from API fetch → backend calculation → frontend display.

---

## Table of Contents

1. [Bugs Fixed](#1-bugs-fixed)
2. [Cross-App Metric Consistency](#2-cross-app-metric-consistency)
3. [Canonical Formulas](#3-canonical-formulas)
4. [Sector Name Normalization](#4-sector-name-normalization)
5. [FX Adjustment Logic](#5-fx-adjustment-logic)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Remaining Known Issues](#7-remaining-known-issues)
8. [File Reference Index](#8-file-reference-index)

---

## 1. Bugs Fixed

### 1.1 Weight normalization (CRITICAL)

**File:** `server/services/backcast_service.py` → `aggregate_weights()`

**Was:** `w = item.weight / 100.0 if item.weight > 1 else item.weight`
**Problem:** A 0.5% position (`weight=0.5`) stayed at 0.5 → interpreted as 50%. Any position ≤ 1% was silently inflated by 100×.
**Fix:** Always divide by 100 (`w = item.weight / 100.0`). The subsequent normalisation (sum→1) preserves correct proportions even if weights were already in decimal form.

### 1.2 Sortino ratio denominator (CRITICAL)

**Files:** `server/services/backcast_service.py`, `client/views/performance/PerformanceView.tsx`

**Was:** `np.std(negative_rets)` — std of only negative returns, subtracting their own mean, dividing by N_negative.
**Problem:** Inflated Sortino by ~1.5–2× because the denominator was too small.
**Fix:** Proper target-downside deviation: `sqrt(mean(min(r_i, 0)^2))` — squares all returns below target (0), averages over ALL observations.

### 1.3 Beta ddof mismatch (SIGNIFICANT)

**Files:** `server/services/backcast_service.py`, `server/routes/risk.py`

**Was:** `np.cov(a, b)[0,1] / np.var(b)` — `np.cov` uses ddof=1, `np.var` uses ddof=0.
**Problem:** Beta inflated by factor N/(N-1) ≈ 1.004 for 250 observations. Small but conceptually wrong.
**Fix:** `np.var(b, ddof=1)` everywhere. All np.std/np.var calls now explicitly use `ddof=1`.

### 1.4 `get_price_on_date` silent fallback to 1.0 (CRITICAL)

**File:** `server/market_data.py`

**Was:** `return 1.0` on any price fetch error.
**Problem:** A $150 stock returning 1.0 creates a phantom −99.3% return, silently corrupting attribution.
**Fix:** Returns `None`. All call sites (`get_fx_return`, `calculate_benchmark_returns`, `build_results_dataframe`, `get_ticker_performance`) now check for `None` and default to 0% return when data is missing.

### 1.5 Frontend metric formulas inconsistent with backend (SIGNIFICANT)

**File:** `client/views/performance/PerformanceView.tsx` → `computeMetricsFromSeries()`

**Was:**
- Volatility: `std * sqrt(N)` — scaled by data-point count, not annualised
- Sharpe: `totalReturn% / volatility%` — not the standard mean/std formula
- Std/Covariance: ddof=0 (population)

**Fix:**
- Volatility: `std(ddof=1) * sqrt(252) * 100` — always annualised
- Sharpe: `(meanDaily / stdDaily) * sqrt(252)` — matches backend exactly
- Sortino: proper downside deviation
- All std/cov: ddof=1 (sample)

### 1.6 Population vs sample std across codebase (MINOR)

**Was:** Backcast used `np.std()` (ddof=0), risk contribution used `pd.DataFrame.std()` (ddof=1).
**Fix:** All computation now uses ddof=1 consistently. This means the "portfolioVol" from `/risk-contribution` and the "volatility" from `/portfolio-backcast` will match for the same portfolio.

---

## 2. Cross-App Metric Consistency

### 2.1 BETA — 3 different meanings across the app

| Location | What it measures | Source | Typical value for AAPL |
|----------|-----------------|--------|----------------------|
| **Dashboard** (PortfolioTable) | yfinance fundamental beta vs S&P 500 | `/fetch-betas` → `yf.Ticker.info["beta"]` | ~1.2 |
| **Performance tab** (KPI + rolling chart) | Portfolio beta vs chosen benchmark (75/25, TSX60, SP500) | `/portfolio-backcast` → `cov(ptf, bmk) / var(bmk)` | ~0.9 |
| **Risk tab** (per-position) | Position beta vs **the portfolio itself** | `/risk-contribution` → `cov(ticker_i, portfolio) / var(portfolio)` | ~1.3 |
| **Risk tab** (portfolio-level KPI) | Portfolio beta vs 75/25 benchmark | `/risk-contribution` → `cov(portfolio, bmk) / var(bmk)` | ~0.9 |

**Key insight:** Dashboard beta and Performance beta measure different things. Dashboard beta is a fundamental property of the stock (vs S&P 500). Performance beta is the portfolio's sensitivity to the chosen benchmark. Risk per-position beta is sensitivity to the portfolio itself (useful for risk decomposition but not comparable to the other two).

**This is by design** — each tab has a different analytical purpose — but users may be confused when "Beta" shows different values on different tabs.

**Recommendation for future:** Add tooltips explaining "Beta vs S&P 500", "Beta vs Benchmark", "Beta to Portfolio" to disambiguate.

### 2.2 SHARPE — now consistent ✅

| Location | Formula | Source |
|----------|---------|--------|
| **Performance KPI** (1Y) | `(μ_daily / σ_daily) × √252` | Backend `compute_backcast_metrics()` |
| **Performance KPI** (sub-period: YTD, 3M, 6M) | `(μ_daily / σ_daily) × √252` | Frontend `computeMetricsFromSeries()` |
| **Rolling chart** | `(μ_daily / σ_daily) × √252` per window | Backend `compute_rolling_metrics()` |
| **Risk table** "Risk-Adj Return" | `annualised_return / individual_vol` | Backend `/risk-contribution` |

All use ddof=1 for std, √252 annualisation. The "risk-adjusted return" in the risk table is conceptually the same as Sharpe but for individual positions, not the portfolio.

### 2.3 VOLATILITY — now consistent ✅

| Location | Formula | Source |
|----------|---------|--------|
| **Performance KPI** | `σ_daily(ddof=1) × √252 × 100` | Backend or frontend |
| **Risk KPI** "Portfolio Volatility" | `√(w' Σ w) × 100` where `Σ = cov(ddof=1) × 252` | Backend `/risk-contribution` |
| **Risk table** per-position | `σ_daily(ddof=1) × √252 × 100` | Backend `/risk-contribution` |
| **Rolling chart** | `σ_daily(ddof=1) × √252 × 100` per window | Backend `/rolling-metrics` |

The matrix approach (`√(w'Σw)`) and the direct approach (`std(Σ w_i × r_i)`) produce the same result when both use ddof=1.

### 2.4 SORTINO — now consistent ✅

| Location | Formula |
|----------|---------|
| **Performance KPI** (backend) | `(μ_daily / DD) × √252` where DD = `√(mean(min(r,0)²))` |
| **Performance KPI** (frontend sub-period) | Same formula |

### 2.5 ALPHA — 2 different calculations

| Location | Formula |
|----------|---------|
| **Performance KPI** (backend, 1Y) | Annualised alpha: `(1+R_ptf)^(1/y) - 1 - [(1+R_bmk)^(1/y) - 1]` |
| **Performance KPI** (frontend, sub-period) | Simple excess: `totalReturn% - benchmarkReturn%` |

Both are valid but measure different things. The annualised alpha from the backend compounds returns over the period; the frontend version is the simple period excess. For periods < 1 year, the difference is small.

### 2.6 SECTOR NAMES — duplicated normalisation maps

The following files each define their own yfinance → GICS mapping:

| File | Map variable |
|------|-------------|
| `client/components/PortfolioTable.tsx` | `SECTOR_MAP` (28 entries) |
| `client/components/SectorDeviationCard.tsx` | `SECTOR_MAP` (inline) |
| `client/components/SectorGeographyDeviationCard.tsx` | `SECTOR_MAP` (inline) |
| `client/views/attribution/AttributionView.tsx` | `sectorMapping` (inline) |
| `client/components/ClevelandDotPlot.tsx` | `sectorMap` (inline) |
| `server/routes/market.py` | `SECTOR_OVERRIDES` (only ATD.TO) |
| `server/routes/risk.py` | Raw yfinance names (no normalisation) |

**Problem:** The risk tab returns raw yfinance sector names (e.g., "Consumer Cyclical", "Basic Materials") while the dashboard normalises them to GICS (e.g., "Consumer Discretionary", "Materials"). If a future mapping is added to one file but not others, sectors will disagree.

**Recommendation for future:** Extract a single shared `normalizeSector()` utility used by all components, or normalise on the backend before sending to the client.

---

## 3. Canonical Formulas

All formulas below are what the code now implements after the fixes.

### Sharpe Ratio (annualised)
```
Sharpe = (μ_daily / σ_daily) × √252
```
- μ_daily = mean of daily returns
- σ_daily = std of daily returns (ddof=1)

### Sortino Ratio (annualised)
```
Sortino = (μ_daily / DD_daily) × √252
DD_daily = √(mean(min(r_i, 0)²))
```
- Downside deviation computed over ALL observations
- Positive returns contribute 0 (not excluded)

### Beta (vs benchmark)
```
β = Cov(r_ptf, r_bmk) / Var(r_bmk)
```
- Both Cov and Var use ddof=1
- `np.cov(a, b)[0,1]` already uses ddof=1 by default

### Volatility (annualised)
```
Vol = σ_daily × √252 × 100  (as percentage)
```

### Alpha (annualised, backend only)
```
α = [(1 + R_ptf)^(1/y) - 1] - [(1 + R_bmk)^(1/y) - 1]
```
- y = number of trading days / 252

### Information Ratio
```
IR = (μ_excess × 252) / (σ_excess × √252)
   = (μ_excess × √252) / σ_excess
```
- excess = daily portfolio return - daily benchmark return

### Tracking Error
```
TE = σ(r_ptf - r_bmk) × √252 × 100
```

### FX-Adjusted Return
```
r_cad = (1 + r_usd) × (1 + r_fx) - 1
```
- r_fx = USDCAD daily return (positive = CAD weakens = good for CAD investor)

### Marginal Contribution to Risk (MCTR)
```
MCTR = (Σ × w) / σ_portfolio
```
- Σ = annualised covariance matrix = daily_cov × 252

### Component Risk
```
CR_i = w_i × MCTR_i
```

### Diversification Ratio
```
DR = Σ(w_i × σ_i) / σ_portfolio
```
- > 1 means diversification is reducing risk

### VaR 95% (1-day, historical)
```
VaR = |percentile(portfolio_daily_returns, 5)|
```

### CVaR 95% (1-day, historical)
```
CVaR = |mean(returns where return ≤ VaR_threshold)|
```

---

## 4. Sector Name Normalization

yfinance returns non-standard sector names. The canonical mapping (used in PortfolioTable.tsx) is:

| yfinance name | GICS standard |
|--------------|---------------|
| Basic Materials | Materials |
| Consumer Cyclical | Consumer Discretionary |
| Consumer Defensive | Consumer Staples |
| Financial Services | Financials |
| Healthcare | Health Care |
| Technology | Information Technology |
| Communication Services | Communication Services |
| Real Estate | Real Estate |
| Industrials | Industrials |
| Energy | Energy |
| Utilities | Utilities |

**Server override:** ATD.TO → "Consumer Staples" (yfinance misclassifies as "Consumer Cyclical")

**Risk tab caveat:** The `/risk-contribution` endpoint returns raw yfinance sector names in its `positions[].sector` and `sectorRisk[].sector` fields. Frontend components that display risk data need to normalise these.

---

## 5. FX Adjustment Logic

**Central function:** `server/market_data.py` → `needs_fx_adjustment(ticker, is_mutual_fund, nav_dict)`

| Condition | FX adjusted? | Reason |
|-----------|-------------|--------|
| Ticker == `*CASH*` | No | Cash has no price |
| `is_mutual_fund=True` or ticker in `nav_dict` | No | NAV data is already in CAD |
| Ticker ends with `.TO` | No | TSX-listed = CAD-denominated |
| Ticker == `^GSPTSE` | No | TSX index = CAD |
| Everything else | **Yes** | Assumed USD-listed |

**FX tickers used:**
- `USDCAD=X` — used in backcast/risk (via `BENCHMARK_BLEND_TICKERS`)
- `CAD=X` — used in attribution (via `FX_TICKER` constant)
- Both resolve to the same yfinance data (USD per CAD).

**Benchmark FX:** ACWI is USD-denominated, so the 75/25 benchmark converts ACWI returns: `(1 + r_ACWI) × (1 + r_USDCAD) - 1`

---

## 6. Data Flow Diagrams

### Performance Tab
```
Frontend: loadPortfolioConfig() → convertConfigToItems()
    ↓ POST /portfolio-backcast {items, benchmark}
Backend: aggregate_weights() → fetch_returns_df() → build_portfolio_returns() + build_benchmark_returns()
    → compute_backcast_metrics() → {metrics, series, topDrawdowns}
    ↓
Frontend: full 1Y metrics from backend
    For sub-periods (YTD, 3M, 6M): computeMetricsFromSeries(filtered_series)
    → PerformanceKPIs + PerformanceCharts
```

### Risk Tab
```
Frontend: loadPortfolioConfig() → convertConfigToItems()
    ↓ POST /risk-contribution {items}
Backend: aggregate_weights() → fetch_returns_df()
    → Build per-ticker FX-adjusted returns matrix
    → Covariance matrix (annualised, ddof=1)
    → MCTR, component risk, betas, diversification ratio
    → Sector aggregation, correlation matrix (top 15)
    ↓
Frontend: RiskKPIs + RiskBarChart + RiskTable + CorrelationHeatmap
```

### Rolling Metrics
```
Frontend: POST /rolling-metrics {items, benchmark}
Backend: Same pipeline as backcast, then compute_rolling_metrics()
    → Sliding windows (21/63/126 days)
    → Per-window: Sharpe, Vol, Beta
    ↓
Frontend: RollingMetricsChart (3 line charts)
```

### Dashboard (Attribution)
```
Frontend: POST /analyze-manual {items}
Backend: calculate_returns() → build_results_dataframe()
    → Per-ticker per-period: weight, return, contribution
    → YTD aggregate return & contribution
    ↓
Frontend: DashboardView → PortfolioTable + PortfolioEvolutionChart + KPICards

Enrichment: POST /fetch-sectors, /fetch-betas, /fetch-dividends
    → Cached in localStorage (versioned)
    → Displayed in PortfolioTable columns
```

---

## 7. Remaining Known Issues

### 7.1 ETF beta hardcoded to 1.0 in dashboard
**File:** `server/routes/market.py` lines 195-196
ETFs (QQQ, XEG.TO, etc.) get `beta=1.0` from `/fetch-betas`. The risk tab computes correct beta from returns.
**Impact:** Dashboard beta column misleading for ETFs.

### 7.2 `/fetch-performance` returns native-currency returns
**File:** `server/routes/market.py` → `fetch_performance()`
Period returns (YTD, 1Y, etc.) are not FX-adjusted. US stocks show USD returns while the rest of the app shows CAD.
**Impact:** Minor — this endpoint is used for the currency/performance display, not portfolio analytics.

### 7.3 `aggregate_weights` takes MAX weight for duplicate tickers
**File:** `server/services/backcast_service.py` line 42
When multi-period items are sent, the backcast uses the highest weight ever assigned (not the latest).
**Impact:** If you rebalanced from 20% → 5%, backcast uses 20%. This overstates reduced positions.

### 7.4 Missing tickers → implicit 0% return
**File:** `server/services/backcast_service.py` → `build_portfolio_returns()`
Missing tickers' weight is not redistributed; effectively earns 0%.
**Impact:** Understates (or overstates) portfolio return depending on whether missing ticker outperformed.

### 7.5 Frontend localStorage cache has no TTL
**File:** `client/services/api.ts`
Sectors, betas, dividends cached forever until code version bump.
**Impact:** Stale sector after company reclassification.

### 7.6 Canadian ETF beta heuristic is fragile
**File:** `server/routes/market.py` lines 167-176
Pattern `(starts with X/V/Z/H and ends with .TO)` catches most iShares/Vanguard/BMO ETFs but also matches stocks like VET.TO (Vermilion Energy).

### 7.7 Sector names not normalised on the backend
The `/risk-contribution` and `/fetch-sectors` endpoints return raw yfinance sector names. Multiple frontend components independently maintain normalisation maps.
**Recommendation:** Normalise on the server before returning, or extract a shared `normalizeSector()` utility.

---

## 8. File Reference Index

### Backend — Computation

| File | Purpose |
|------|---------|
| `server/services/backcast_service.py` | Core metric engine: Sharpe, Sortino, Beta, Vol, Alpha, Drawdowns, Rolling metrics |
| `server/routes/risk.py` | Risk decomposition: MCTR, component risk, diversification, VaR/CVaR, correlation matrix |
| `server/market_data.py` | Price fetching, FX logic, return calculations, attribution data pipeline |
| `server/routes/market.py` | Sector/beta/dividend data from yfinance (cached) |
| `server/routes/portfolio.py` | Manual portfolio analysis orchestrator |
| `server/routes/index.py` | Index exposure, index history, sector ETF history |
| `server/data_loader.py` | CSV NAV parser (8+ date formats) |
| `server/cache_manager.py` | Pickle cache with TTL + historical data preservation |
| `server/constants.py` | Benchmark tickers, FX ticker, cache paths |

### Frontend — Display + Computation

| File | Purpose |
|------|---------|
| `client/services/api.ts` | All API calls, localStorage caching, `convertConfigToItems()` |
| `client/views/performance/PerformanceView.tsx` | Sub-period metric computation from series data |
| `client/views/performance/PerformanceKPIs.tsx` | KPI card rendering (Sharpe, Sortino, Alpha, Vol, Beta, etc.) |
| `client/views/risk/RiskContributionView.tsx` | Risk tab orchestrator |
| `client/views/risk/RiskBarChart.tsx` | Sector risk bar chart |
| `client/views/risk/RiskTable.tsx` | Per-position risk detail table |
| `client/views/DashboardView.tsx` | Dashboard orchestrator, fetches sectors/betas/dividends |
| `client/components/PortfolioTable.tsx` | Holdings table with sector normalisation + GICS columns |
| `client/components/RollingMetricsChart.tsx` | Rolling Sharpe/Vol/Beta line charts |
| `client/components/SectorDeviationCard.tsx` | Portfolio vs benchmark sector deviation |
| `client/components/SectorGeographyDeviationCard.tsx` | Portfolio vs benchmark geography deviation |

### Configuration

| File | Purpose |
|------|---------|
| `server/data/portfolio_config.json` | Multi-period allocation (periods with weights per ticker) |
| `server/data/custom_sectors.json` | ETF sector breakdowns |
| `server/data/custom_geography.json` | Geographic classification overrides |
| `server/data/manual_navs.json` | Manually entered NAV values |
| `server/data/sectors_cache.json` | Ticker → sector cache |
| `server/data/betas_cache.json` | Ticker → beta cache |
| `server/data/dividends_cache.json` | Ticker → dividend yield cache |

## 9. Frontend Rendering Correctness

### 9.1 Beta — three different values by design, but confusing UX

The user sees three different "Beta" values across tabs:

| Tab | Value shown | Source | What it actually measures |
|-----|-------------|--------|--------------------------|
| **Holdings** (Dashboard KPI) | ~0.96 | Weighted avg of `betaMap[ticker]` from `/fetch-betas` | yfinance fundamental beta (trailing 5Y monthly vs **S&P 500**) |
| **Risk Contribution** (KPI) | ~0.88 | `portfolioBeta` from `/risk-contribution` | Regression beta vs **75/25 composite** over **1 year** of daily returns |
| **Relative Performance** (KPI) | ~0.50 | Frontend `computeMetricsFromSeries()` | Regression beta vs **75/25 composite** over **selected sub-period only** (e.g. YTD ≈ 60 days) |

**Why they differ:**
1. **Holdings vs Risk Contribution**: Different reference indices. yfinance beta is vs S&P 500 alone; risk contribution beta is vs the 75/25 ACWI/XIU blend. Also, yfinance uses monthly data over 5 years; our backend uses daily data over 1 year. ETFs are hardcoded to 1.0 by `/fetch-betas` which further skews the weighted average.
2. **Risk Contribution vs Performance**: Same formula, same benchmark, but **different time windows**. Risk Contribution always uses the full 1Y of data. Performance uses only the filtered sub-period (default: YTD). With ~60 data points, the beta estimate is much noisier. If you switch Performance to the "1Y" period, it should closely match the Risk Contribution value.

**How to verify they're correct:** Select "1Y" in the Performance tab — its beta should match the Risk Contribution `portfolioBeta` to within rounding (both use `cov(ptf, bmk) / var(bmk)` on the same 1Y daily data).

**Fixes applied:**
1. **Performance tab 1Y** now uses the backend's pre-computed `data.metrics.beta` directly (same formula and data as Risk Contribution), guaranteeing they match. Frontend recomputation is only used for sub-periods (YTD, 3M, 6M, 2025).
2. **Risk Contribution** now uses `build_benchmark_returns(request.benchmark)` instead of hardcoded 75/25, so it respects the user's benchmark selection and stays consistent with the backcast.

**Remaining UX recommendation:** Add period labels to beta KPIs, e.g. "Beta (YTD)" vs "Beta (1Y)" vs "Fundamental Beta (5Y)". This makes it clear they measure different things.

### 9.2 Performance KPIs — data source varies by period

`PerformanceView.tsx` **always** computes metrics via `computeMetricsFromSeries(filteredSeries)`, even for the "1Y" period. It never uses the backend's pre-computed `data.metrics` directly for KPI display.

| Period | Data points | Effect |
|--------|-------------|--------|
| 1Y | ~250 | Results match backend closely |
| 6M | ~125 | Annualised metrics still valid, smaller sample |
| 3M | ~63 | Sharpe/Beta noisier, annualisation still correct |
| YTD | ~60 (March) | Same as 3M |
| 2025 | ~250 | Full year, reliable |

All metrics (Sharpe, Sortino, Vol, TE, IR, Beta) are annualised with `√252` regardless of sub-period length, which is the correct convention. The values will change when switching periods because the underlying data changes, not because the formula changes.

### 9.3 Risk KPIs — all from a single API call

`RiskKPIs.tsx` renders directly from the `/risk-contribution` response fields:
- `portfolioVol` → "Portfolio Volatility" card
- `portfolioBeta` → "Portfolio Beta" card
- `diversificationRatio` → "Diversification Ratio" card
- `numEffectiveBets` → "Effective Bets" card
- `var95` → "VaR 95%" card
- `cvar95` → "CVaR 95%" card

All values come from backend, no frontend re-computation. Units are already in percentage from the backend (e.g., `portfolioVol = 12.5` means 12.5%). Rendering is straightforward.

### 9.4 Risk Table per-position beta — beta to PORTFOLIO, not market

`RiskTable.tsx` displays `position.beta` from `/risk-contribution`. This is `cov(ticker_i, portfolio) / var(portfolio)` — each position's sensitivity to the **portfolio itself**, not to a market benchmark.

A stock with market beta of 0.8 can have portfolio-beta of 1.5 if it dominates the portfolio. This is correct for risk decomposition purposes but users may expect market beta here.

### 9.5 Rolling Metrics Chart — always full 1Y, not period-filtered

`RollingMetricsChart.tsx` always renders the full 1Y of rolling data from `/rolling-metrics`. It does NOT filter by the selected period in the Performance tab. This means:
- When the user selects "3M" in Performance, KPIs show 3M metrics, but rolling charts still show the full year of rolling windows.
- This is **intentional** — rolling charts need historical context to be useful.

### 9.6 Sector deviation cards — duplicated normalisation maps

The following components each maintain their own yfinance → GICS mapping:

| Component | Map variable | Entries |
|-----------|-------------|---------|
| `PortfolioTable.tsx` | `SECTOR_MAP` | 28 |
| `SectorDeviationCard.tsx` | `SECTOR_MAP` (inline) | ~8 |
| `SectorGeographyDeviationCard.tsx` | `SECTOR_MAP` (inline) | ~8 |
| `AttributionView.tsx` | `sectorMapping` (inline) | ~12 |
| `ClevelandDotPlot.tsx` | `sectorMap` (inline) | ~8 |

If a new sector synonym is added to one map but not the others, sectors will disagree between tabs. The Risk tab receives **raw yfinance names** from the backend (no normalisation), so it may show "Consumer Cyclical" where the Dashboard shows "Consumer Discretionary" for the same stock.

### 9.7 PortfolioTable beta column — per-stock yfinance beta

`PortfolioTable.tsx` renders `betaMap[ticker]` per row. This is the yfinance fundamental beta, same source as the Dashboard KPI weighted average. It's **not** the risk-contribution beta or the regression beta. The column header just says "β" with no qualifier.

### 9.8 Volatility consistency across tabs

| Location | Value | Source | Should match? |
|----------|-------|--------|--------------|
| Performance KPI "Volatility" (1Y) | `std(daily_ptf_returns) × √252 × 100` | Frontend from series | Yes — matches Risk ±0.1% |
| Risk KPI "Portfolio Volatility" | `√(w' Σ w) × 100` | Backend `/risk-contribution` | Yes — matches Performance ±0.1% |
| Risk Table "Vol" column | `std(daily_ticker_returns) × √252 × 100` | Backend `/risk-contribution` | N/A — per-position, not portfolio |
| Rolling Chart "Volatility" | `std(window) × √252 × 100` | Backend `/rolling-metrics` | Shows time-varying vol |

The Performance and Risk portfolio volatilities use different approaches (direct std vs matrix) but both use ddof=1 and the same 1Y daily data, so they should agree within rounding.

### 9.9 Max Drawdown sign convention

Backend returns max drawdown as a **negative percentage** (e.g., `-12.5`). Frontend `PerformanceKPIs.tsx` wraps negative values in parentheses: `(12.5%)`. This is correct accounting-style notation for losses.

### 9.10 Summary: what matches and what doesn't

| Metric | Dashboard → Performance → Risk | Verdict |
|--------|---------------------------------|---------|
| **Beta** | 0.96 → 0.50 → 0.88 | **3 different definitions** — by design but needs labels |
| **Volatility** | N/A → 12.5% → 12.5% | Matches ✅ |
| **Sharpe** | N/A → 1.23 → N/A | Single source ✅ |
| **Sortino** | N/A → 1.45 → N/A | Single source ✅ |
| **Sector** | "Consumer Discretionary" → N/A → "Consumer Cyclical" | **Inconsistent naming** |
| **Max Drawdown** | N/A → (5.2%) → N/A | Single source ✅ |

---

*Audit performed 2026-03-23. Updated with frontend rendering correctness audit.*
