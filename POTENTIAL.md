# Potential Enhancements (Future Roadmap)

## Option B: Individual Stock Beta to Portfolio Benchmark (Future Enhancement)

### Description
Calculate each individual holding's beta relative to the portfolio's chosen benchmark (75% ACWI + 25% XIC.TO, or whichever benchmark the user selects), then aggregate them to compute portfolio beta using the Bi × Wi formula.

**Formula:** Portfolio Beta = Σ(weight_i × beta_i_to_benchmark)

### Rationale
- More granular understanding of how each holding contributes to overall portfolio beta
- Allows individual position-level beta analysis relative to chosen benchmark (not S&P 500)
- Could enable "Beta contribution" analysis similar to risk contribution

### Current Status
- **NOT IMPLEMENTED** - marked as future enhancement
- Would require significant backend changes to compute individual betas to custom benchmarks

### Why Not Now
1. **Performance Cost:** Computing beta for 20-30 holdings against custom benchmark is expensive
   - Requires 1 year of daily returns for each stock
   - Requires computing covariance for each stock × benchmark
   - Estimated: 20-50ms per portfolio calculation (currently ~100ms for full risk analysis)

2. **Complexity:** Benchmark selection needs to be consistent across all calculations
   - Currently supports: "75/25" (default), "TSX", "SP500"
   - Need to ensure custom benchmarks work with this calculation

3. **UI Complexity:** Would need to display individual betas to benchmark in RiskTable
   - Current RiskTable shows beta-to-portfolio (different metric)
   - Would need clarification in tooltips/legends

### Implementation Plan (If Needed)
1. Create `compute_individual_betas_to_benchmark()` function in backcast_service.py
2. Add endpoint: `POST /individual-betas` that takes portfolio data + benchmark choice
3. Cache results in data/individual_betas_cache.json (keyed by ticker + benchmark)
4. Update RiskTable to optionally show both:
   - Beta to portfolio (current MCTR-related metric)
   - Beta to benchmark (new, for portfolio beta aggregation)
5. Add toggle in Risk view to switch between views

### Expected Benefits
- More accurate position-level risk attribution
- Better explanation of portfolio beta composition
- Granular benchmark sensitivity analysis per holding

### Dependencies
- None - can be added independently after current KPI consolidation

### Estimated Effort
- Backend: 3-4 hours (implement function, caching, endpoint)
- Frontend: 2-3 hours (UI updates, tooltips)
- Testing: 2-3 hours (verify against manual calculations)
- **Total:** ~8-10 hours

### Success Criteria
1. Portfolio beta computed via Σ(weight_i × beta_i) matches direct calculation within 0.01
2. Each holding's beta to benchmark is correctly cached and reused
3. Performance impact < 50ms added to risk calculation
4. Documentation clearly distinguishes:
   - Market beta (to S&P 500)
   - Beta to portfolio
   - Beta to benchmark
