# Portfolio Analytics Backend

FastAPI server for the portfolio analytics app. The live frontend now consumes a single canonical workspace payload from `POST /portfolio-workspace`.

## Quick Start

Prerequisites: Python 3.8+ and internet access for Yahoo Finance lookups.

```bash
cd server
pip install -r requirements.txt
python main.py
```

Server runs at `http://localhost:8000`.

## Key Endpoints

| Endpoint | Description |
| --- | --- |
| `POST /portfolio-workspace` | Canonical portfolio workspace used by the live app |
| `GET /benchmark-workspace` | Canonical benchmark workspace used by index, dashboard, and report views |
| `POST /index-refresh` | Rebuild benchmark workspace cache and refresh benchmark slices |
| `POST /analyze-manual` | Legacy attribution analysis response kept for compatibility |
| `GET /fetch-sectors` | Sector classification lookup |
| `GET /sector-history` | Sector benchmark history |
| `GET /index-history` | Compatibility wrapper over benchmark workspace history |
| `GET /index-exposure` | Compatibility wrapper over benchmark workspace composition |
| `POST /save-portfolio-config` | Persist portfolio configuration |
| `GET /load-portfolio-config` | Load saved configuration |
| `POST /upload-nav` | Upload custom mutual fund NAV data |
| `GET /check-nav-lag` | Check for NAV reporting lag |

## Project Structure

```text
server/
|-- main.py                  # FastAPI app bootstrap
|-- routes/                  # API routers
|-- services/                # Canonical workspace and shared calculations
|-- market_data.py           # Return calculations, FX adjustment
|-- data_loader.py           # Historic NAV CSV loading
|-- cache_manager.py         # Market data cache (pickle)
|-- fetch_price_history.py   # Yahoo Finance integration
|-- index_scraper.py         # Index data scraping
|-- constants.py             # Benchmarks, tickers, config
|-- requirements.txt
`-- data/
    |-- historic_navs/       # Mutual fund NAV CSVs
    |-- price_history/       # Cached price data
    |-- manual_navs.json     # Manually entered NAVs
    |-- portfolio_config.json
    |-- custom_sectors.json
    `-- sector_history_cache.json
```

## Runtime Model

1. The client sends holdings snapshots to `POST /portfolio-workspace`.
2. The server normalizes the analysis timeline and resolves prices or mutual fund NAVs.
3. The canonical workspace builder computes:
   - `holdings`
   - `attribution`
   - `performance`
   - `risk`
   - `audit`
4. A separate canonical benchmark workspace builder computes:
   - `composition`
   - `performance`
   - `currency`
   - `meta`
5. Compatibility routes such as `index-history` and `index-exposure` now proxy that benchmark workspace instead of owning their own fetch logic.

## Special Cases

- `*cash*` tickers are forced to 0% return in all periods.
- Mutual fund NAVs come from `data/historic_navs/` or manual NAV inputs instead of Yahoo Finance.
- All returns are expressed in CAD after FX adjustment where required.
