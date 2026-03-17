# TODO: Audit Canadian Sector ETF Tickers

## Context
The Attribution Analysis now supports region-aware benchmarks (US/CA/ALL). The Canadian sector ETF tickers used in `server/main.py` and `client/views/AttributionView.tsx` need to be verified — some are wrong.

## Known Issues
- **XHC.TO** (Health Care): This is a US healthcare ETF (CAD-hedged), NOT a Canadian healthcare sector ETF. Need to find a true Canadian healthcare ETF or remove this sector for CA benchmarking.

## Tickers to Verify
All Canadian sector ETFs in the `ca_sector_map` need validation:

| Sector | Current Ticker | Status | Notes |
|--------|---------------|--------|-------|
| Financials | XFN.TO | ? | Verify |
| Energy | XEG.TO | ? | Verify |
| Materials | XMA.TO | ? | Verify |
| Industrials | ZIN.TO | ? | Verify |
| Information Technology | XIT.TO | ? | Verify |
| Utilities | XUT.TO | ? | Verify |
| Real Estate | XRE.TO | ? | Verify |
| Consumer Staples | XST.TO | ? | Verify |
| Consumer Discretionary | XCD.TO | ? | Verify |
| Health Care | XHC.TO | WRONG | US healthcare ETF (CAD-hedged), not Canadian sector |

## Files to Update
- `server/main.py` — `ca_sector_map` in `/sector-history` endpoint
- `client/views/AttributionView.tsx` — `CA_SECTOR_BENCHMARK_ETF` map inside `sectorAttributionData` useMemo
