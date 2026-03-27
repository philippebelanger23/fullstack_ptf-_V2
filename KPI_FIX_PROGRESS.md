# KPI Audit & Fix Progress

**Status:** 🟡 IN PROGRESS - Phase 1 Complete, Phases 2-4 Pending

---

## ✅ COMPLETED: Option A Implementation

### Changes Made (2026-03-26)

#### 1. DashboardView.tsx
- **Removed:** Portfolio beta calculation from market betas (`Σ(weight × market_beta)`)
- **Added:** Direct fetch of `portfolioBeta` from `/risk-contribution` endpoint
- **Added:** State variable `portfolioBeta` to store the correct portfolio-to-benchmark beta
- **Updated:** Beta display in "Risk & Income" KPI Card to show:
  - Portfolio beta to chosen benchmark (75% ACWI + 25% XIU.TO)
  - Added tooltip: "ⓘ to benchmark" for clarity
  - Shows "—" when data is still loading

#### 2. PortfolioTable.tsx
- **Added:** Clarification tooltip on beta column
  - `"Beta to S&P 500 (market beta). See Risk Contribution view for portfolio-level beta analysis."`
  - This clarifies that the column shows individual stock market betas, NOT portfolio metrics
- **Preserved:** `betaMap` functionality for market beta display (still fetched)

#### 3. API Integration
- **Added:** Import of `fetchRiskContribution` from services/api
- **New Effect:** Portfolio beta is now fetched alongside other market data
- **Dependency:** Added `currentHoldings` to effect dependencies to recalculate when portfolio changes

---

## 📊 Beta Definition Clarifications

After this fix, users will see:

| Location | Beta Type | Value | Meaning |
|----------|-----------|-------|---------|
| **Dashboard KPI** | Portfolio-to-Benchmark | 0.92 | Portfolio's sensitivity to your 75/25 blend |
| **Dashboard Table** | Market Beta (Stock) | 1.2 | AAPL's sensitivity to S&P 500 |
| **Risk View KPIs** | Portfolio-to-Benchmark | 0.92 | Same as Dashboard (now consistent!) |
| **Risk Table Cols** | Stock-to-Portfolio | 1.5 | Stock's sensitivity to overall portfolio |

**Key Point:** All three are now properly labeled and users understand they're different metrics.

---

## 🔄 Remaining Work

### Phase 2: Consolidate Redundant KPI Calculations ⏳ PENDING

**Status:** Not started
**Priority:** HIGH
**Effort:** 4-6 hours

**Task:** Remove duplicate beta calculation from three endpoints:
- `server/services/backcast_service.py:166` - compute_backcast_metrics()
- `server/services/backcast_service.py:283` - compute_rolling_metrics()
- `server/routes/risk.py:183` - risk_contribution()

**Steps:**
1. Create new utility function: `def compute_portfolio_beta_to_benchmark()` in backcast_service.py
2. Update all three endpoints to call this single function
3. Add unit test to verify all three return identical beta within 0.01

---

### Phase 3: Consolidate Volatility Calculations ⏳ PENDING

**Status:** Not started
**Priority:** HIGH
**Effort:** 3-4 hours

**Task:** Resolve three different volatility calculation methods:
- `backcast_service.py:161` - `std(returns) * sqrt(252)`
- `backcast_service.py:197` - `std(bmk_returns) * sqrt(252)`
- `risk.py:130` - `sqrt(w @ cov_matrix @ w)`

**Steps:**
1. Compare all three methods with test data to find discrepancies
2. Choose canonical method
3. Replace all others with calls to canonical function
4. Add comment explaining why this method (numerical stability, performance, etc.)

---

### Phase 4: Consolidate Sharpe Ratio Calculations ⏳ PENDING

**Status:** Not started
**Priority:** MEDIUM
**Effort:** 2-3 hours

**Task:** 4 different Sharpe calculations need consolidation:
- Daily annualization (backcast_service.py × 3 locations)
- Monthly annualization (attribution.tsx)

**Steps:**
1. Create parameterized function: `def compute_sharpe_ratio(returns_series, periods_per_year=252)`
2. Update all locations to call this function with correct `periods_per_year`
3. Verify monthly Sharpe uses `periods_per_year=12`

---

### Phase 5: Data Consistency Tests ⏳ PENDING

**Status:** Not started
**Priority:** HIGH
**Effort:** 3-4 hours

**Task:** Add unit tests to catch future KPI mismatches

**Test cases:**
```python
def test_beta_consistency():
    """All three endpoints return identical portfolio beta"""
    response1 = compute_backcast_metrics(ptf_ret, bmk_ret)
    response2 = compute_rolling_metrics(ptf_ret, bmk_ret)  # latest window
    response3 = risk_contribution(items)

    assert abs(response1['beta'] - response3['portfolioBeta']) < 0.01
    assert abs(response2['beta'][-1] - response3['portfolioBeta']) < 0.01

def test_volatility_methods():
    """Both volatility methods produce identical results"""
    method1_vol = std(returns) * sqrt(252)
    method2_vol = sqrt(returns.cov() * 252)
    assert abs(method1_vol - method2_vol) < 0.001

def test_portfolio_beta_aggregation():
    """Portfolio beta = Σ(weight × individual_beta) when benchmarks match"""
    # Requires individual betas to same benchmark (Phase 2 Feature)
    portfolio_beta_direct = cov(ptf_returns, bmk_returns) / var(bmk_returns)
    portfolio_beta_aggregated = sum(weights * individual_betas)
    assert abs(portfolio_beta_direct - portfolio_beta_aggregated) < 0.01
```

---

## 📝 Documentation Updates Needed

- [ ] Update tooltips in Risk View KPIs to explain "beta to benchmark"
- [ ] Add glossary section to README explaining three beta types
- [ ] Update POTENTIAL.md with implementation timeline for Option B
- [ ] Add changelog entry documenting this beta fix

---

## 🔍 Testing Checklist

Before merging this change, verify:

- [ ] Dashboard beta matches Risk View beta (should be identical)
- [ ] Loading state shows "—" for beta while calculating
- [ ] Market betas still display in PortfolioTable
- [ ] Portfolio table beta column shows tooltip on hover
- [ ] No console errors on Dashboard load
- [ ] Beta updates when portfolio holdings change
- [ ] Responsive design maintained (KPI Card layout OK)

---

## 🎯 Success Criteria

✅ **Phase 1 (Option A) Complete:**
- [x] Dashboard uses portfolio-to-benchmark beta from risk endpoint
- [x] Market betas still available for individual stock display
- [x] Beta definitions clarified with tooltips
- [x] No redundant calculations on frontend

⏳ **Phase 2-5 (Consolidation) Pending:**
- [ ] Backend redundant calculations eliminated
- [ ] All KPI calculations use canonical functions
- [ ] Automated tests prevent future mismatches
- [ ] Documentation updated

---

## 📚 Related Files

**Modified:**
- `client/views/DashboardView.tsx` - Portfolio beta source changed
- `client/components/PortfolioTable.tsx` - Added tooltip clarification

**To be modified (Phase 2+):**
- `server/services/backcast_service.py` - Refactor KPI functions
- `server/routes/risk.py` - Remove duplicate KPI calculations
- `server/routes/market.py` - Documentation updates
- `client/views/risk/RiskTable.tsx` - Tooltip updates

**Reference:**
- `KPI_AUDIT_REPORT.md` - Full analysis of all redundancies
- `POTENTIAL.md` - Option B enhancement (future)

