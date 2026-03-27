# KPI Audit Report - Critical Findings

**Date:** 2026-03-26
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

The application has **SIGNIFICANT REDUNDANCY** in KPI computations and **MAJOR INCONSISTENCY** in how Beta is defined and calculated across different views. There are **3 different Beta concepts** being computed in parallel, causing potential data misalignment.

---

## CRITICAL ISSUE #1: THREE DIFFERENT BETAS WITH CONFLICTING DEFINITIONS

### 1. **Market Beta (yfinance) - Individual Stock Beta to S&P 500**

**Location:** `server/routes/market.py:198`
```python
beta = info.get("beta")  # ← Returns yfinance's beta (to S&P 500 for US stocks)
```

**What it represents:** Each stock's sensitivity to the S&P 500 index
**Used in:** DashboardView.tsx (displayed in KPICard as "Beta")
**Calculation:** Done by yfinance externally - we just fetch it

**Problem:** This is beta to a DIFFERENT benchmark than what we use for portfolio analysis!

---

### 2. **Portfolio-to-Benchmark Beta**

**Locations (REDUNDANT):**
- `server/services/backcast_service.py:166` (compute_backcast_metrics)
- `server/services/backcast_service.py:283` (compute_rolling_metrics)
- `server/routes/risk.py:183` (risk_contribution endpoint)

**Formula:**
```python
portfolio_beta = cov(portfolio_returns, benchmark_returns) / var(benchmark_returns)
```

**What it represents:** Portfolio's sensitivity to the chosen benchmark (75% ACWI + 25% XIU.TO by default)
**Used in:** RiskKPIs.tsx component

**Problem:** Calculated 3 different times with identical logic - violation of DRY principle!

---

### 3. **Stock-to-Portfolio Beta** (Rarely used internally)

**Location:** `server/routes/risk.py:151-157`
```python
port_daily_ret = (returns_matrix.values * w).sum(axis=1)
port_daily_var = np.var(port_daily_ret, ddof=1)
betas = []
for i in range(len(ticker_list)):
    b = np.cov(returns_matrix.iloc[:, i].values, port_daily_ret)[0, 1] / port_daily_var
    betas.append(round(b, 3))
```

**What it represents:** Each stock's sensitivity to the overall portfolio (not to a market index)
**Used in:** RiskTable.tsx (displayed in Holdings Breakdown table)

**Problem:** Confusing because it's beta-to-portfolio, not beta-to-market!

---

## CRITICAL ISSUE #2: CONFLICTING PORTFOLIO BETA VALUES

### Data Flow Mismatch

```
Dashboard View ("Beta" KPI Card)
├─ Fetches: Market betas from yfinance (β to S&P 500)
├─ Formula: Σ(weight_i × market_beta_i)
└─ Result: Portfolio's theoretical beta to S&P 500 ❌

Risk View ("Portfolio Beta" KPI Card)
├─ Fetches: Data from /risk-contribution endpoint
├─ Formula: cov(portfolio_ret, benchmark_ret) / var(benchmark_ret)
└─ Result: Portfolio's actual beta to chosen benchmark ✓

Risk Table (Holdings Breakdown)
├─ Fetches: Data from /risk-contribution endpoint
├─ Formula: cov(stock_ret, portfolio_ret) / var(portfolio_ret)
└─ Result: Stock's beta to the PORTFOLIO (not to market!) ❌
```

### The Problem in Plain English

1. **DashboardView** computes beta assuming individual stocks' market betas are to S&P 500
2. **RiskKPIs** computes beta from actual portfolio returns vs your chosen benchmark
3. **RiskTable** computes something entirely different - stock sensitivity to portfolio, not market

These three numbers will NOT match because they're measuring different things!

**Example:**
- Stock ABC has market beta 1.2 (to S&P 500)
- Portfolio beta should be ≈1.1 (weighted average of all market betas) ← NOT CALCULATED CORRECTLY
- But RiskKPIs shows 0.95 (actual portfolio returns vs your 75/25 blend)
- And RiskTable shows stock ABC has beta 1.5 to the portfolio

**User confusion:** Why are all three different? Which one is correct?

---

## CRITICAL ISSUE #3: KPI REDUNDANCY ACROSS COMPUTE PATHS

### Portfolio-to-Benchmark Beta (Calculated 3 Times!)

| Location | Frequency | Last Used |
|----------|-----------|-----------|
| `backcast_service.py:166` | For 1Y backcast | Returned in `/portfolio-backcast` |
| `backcast_service.py:283` | For rolling windows (21/63/126 days) | Returned in `/rolling-metrics` |
| `risk.py:183` | For risk contribution analysis | Returned in `/risk-contribution` |

**Code Duplication Check:**
```python
# All three use identical formula:
if bmk_daily_var > 0:
    portfolio_beta = float(np.cov(ptf_daily, bmk_daily)[0, 1] / bmk_daily_var)
```

### Volatility (Calculated 3 Different Ways!)

| Location | Method | Formula |
|----------|--------|---------|
| `backcast_service.py:161` | Daily returns std | `std(returns) * sqrt(252)` |
| `backcast_service.py:197` | Benchmark returns std | `std(bmk_returns) * sqrt(252)` |
| `risk.py:130` | Covariance matrix | `sqrt(w @ cov @ w)` where cov is annualized |

**Problem:** Different methods can produce slightly different results!
- Method 1 & 2: `std(daily_returns) * sqrt(252)` - direct annualization
- Method 3: `sqrt(covariance_matrix @ weights)` - assumes correlation structure

### Sharpe Ratio (Calculated 4 Times!)

| Location | Frequency | Formula | Annualization |
|----------|-----------|---------|---|
| `backcast_service.py:153` | Daily data | `mean_ret / std_ret` | `× sqrt(252)` |
| `backcast_service.py:198` | Benchmark (daily) | `mean_ret / std_ret` | `× sqrt(252)` |
| `backcast_service.py:276` | Rolling (daily windows) | `mean_ret / std_ret` | `× sqrt(252)` |
| `attribution.tsx:896-903` | Monthly data | `mean_ret / std_ret` | `× sqrt(12)` |

**Problem:** Attribution uses MONTHLY data so its Sharpe is fundamentally different!

---

## CURRENT STATE: KPI COMPUTATION MAP

```
/portfolio-backcast endpoint
├─ Calls: aggregate_weights() → build_portfolio_returns() → build_benchmark_returns()
├─ Computes: Beta, Sharpe, Sortino, Volatility, Alpha, Drawdown
└─ Returns: Full backcast metrics

/risk-contribution endpoint
├─ Calls: aggregate_weights() → build_portfolio_returns() → build_benchmark_returns()
├─ Computes: Individual betas (to portfolio), MCTR, diversification ratio, VaR/CVaR
├─ Also computes: Beta (again!), Volatility (again!) using shared functions
└─ Returns: Position-level risk decomposition + portfolio metrics

/rolling-metrics endpoint
├─ Calls: compute_rolling_metrics()
├─ Computes: Beta, Sharpe, Volatility (rolling windows)
└─ Returns: Time series of rolling metrics

/fetch-betas endpoint (Dashboard)
├─ Calls: yfinance for each ticker
├─ Fetches: Individual stock market betas (to S&P 500)
├─ Caches: Results in data/betas_cache.json
└─ Returns: Market betas map

DashboardView.tsx (Client)
├─ Fetches: betaMap from /fetch-betas
├─ Computes: Portfolio beta = Σ(weight × market_beta)
└─ Displays: In "Risk & Income" KPI Card
```

---

## DATA CONSISTENCY ISSUES

### Issue: Beta Mismatch Between Views

**Scenario:** User has portfolio with holdings
1. Dashboard shows: **Beta = 1.05** (from Σ(w×market_beta))
2. Risk KPIs show: **Beta = 0.92** (from actual portfolio vs 75/25 blend)
3. Risk Table shows individual betas: **avg = 1.18** (from stock-to-portfolio)

**Why different?**
- Market beta (yfinance) assumes correlation with S&P 500
- Portfolio-to-benchmark beta uses actual historical correlation with your 75/25 blend
- Stock-to-portfolio beta uses portfolio as the reference, not an external market index

**Correct Approach:**
Portfolio Beta should be calculated as **Σ(weight_i × beta_i)** where beta_i is each stock's beta to the SAME benchmark used for portfolio beta!

---

## RECOMMENDATIONS

### Phase 1: Consolidate Redundant Beta Calculations
1. Create single function: `compute_portfolio_beta_to_benchmark()`
2. Remove duplicate calculations from backcast_service.py and risk.py
3. Unit test to ensure all three endpoints return identical beta values

### Phase 2: Clarify Beta Definitions
1. **Rename** "avgBeta" in RiskTable to "avg Stock Beta to Portfolio" (to clarify it's different concept)
2. Create clear documentation of 3 beta types:
   - **Market Beta:** Stock sensitivity to S&P 500 (from yfinance)
   - **Portfolio Beta:** Portfolio sensitivity to chosen benchmark
   - **Contribution Beta:** Stock sensitivity to portfolio (for MCTR calculation)
3. Add tooltip in UI explaining difference

### Phase 3: Fix Portfolio Beta Calculation in Dashboard
1. **Stop** fetching individual market betas and multiplying by weights
2. **Instead:** Use the portfolio-to-benchmark beta from risk-contribution endpoint
3. OR: Compute Σ(weight_i × beta_i) using betas to the SAME benchmark, not S&P 500

### Phase 4: Consolidate Volatility Calculations
1. Ensure all volatility calculations use same method
2. Choose: Either (a) daily returns std × sqrt(252) or (b) covariance matrix approach
3. Verify both methods produce identical results with test cases

### Phase 5: Consistency Checks
Add unit tests to verify:
```python
# All three should return identical beta
beta1 = compute_backcast_metrics(...)['beta']
beta2 = compute_rolling_metrics(...)['beta'][-1]  # latest window
beta3 = risk_contribution(...)['portfolioBeta']

assert abs(beta1 - beta3) < 0.01, "Beta mismatch between backcast and risk endpoints!"
```

---

## SUMMARY TABLE: KPI REDUNDANCY

| KPI | Count | Locations | Risk Level |
|-----|-------|-----------|-----------|
| **Portfolio-to-Benchmark Beta** | 3 | backcast_service:166, backcast_service:283, risk.py:183 | 🔴 CRITICAL |
| **Volatility** | 3 | backcast_service:161/197, risk.py:130 | 🔴 CRITICAL (different methods) |
| **Sharpe Ratio** | 4 | backcast_service:153/198/276, attribution:896 | 🟡 HIGH (different frequencies) |
| **Sortino Ratio** | 2 | backcast_service:158, backcast_service:202 | 🟠 MEDIUM (identical formula) |
| **Alpha** | 1 | backcast_service:191 | 🟢 OK |
| **Max Drawdown** | 2 | backcast_service:173/179 | 🟢 OK |
| **Diversification Ratio** | 1 | risk.py:161 | 🟢 OK |
| **VaR/CVaR 95%** | 1 | risk.py:186 | 🟢 OK |
| **Effective Bets** | 1 | risk.py:165 | 🟢 OK |

---

## Files Requiring Changes

1. **server/services/backcast_service.py** - Refactor to use common KPI functions
2. **server/routes/risk.py** - Remove duplicate beta/volatility calculations
3. **client/views/DashboardView.tsx** - Fix portfolio beta calculation
4. **client/views/risk/RiskTable.tsx** - Clarify beta definition in tooltips
5. **server/routes/market.py** - Clarify documentation about yfinance betas

---

## Next Steps

1. Review findings with user
2. Prioritize which beta definition to use for portfolio-level metrics
3. Implement consolidation of redundant KPI calculations
4. Add data validation tests to catch future mismatches
