# Portfolio Analytics — Python Backend

FastAPI server that powers the portfolio analytics platform. Fetches market data, computes FX-adjusted returns and contributions, and serves ~20 endpoints consumed by the React frontend.

---

## Quick Start

**Prerequisites:** Python 3.8+, internet access (fetches live prices from Yahoo Finance)

```bash
cd server
pip install -r requirements.txt
python main.py
```

Server runs at **http://localhost:8000**

> **Tip:** Use `uvicorn main:app --reload` during development for auto-reloading on file changes.

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| FastAPI | REST API framework |
| uvicorn | ASGI server |
| pandas | Data manipulation |
| yfinance | Market data (Yahoo Finance) |
| python-dateutil | Date parsing |

---

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /analyze` | Main portfolio analysis (upload weights file) |
| `POST /analyze-manual` | Portfolio analysis from manually entered data |
| `GET /fetch-performance` | Per-ticker return & contribution data |
| `GET /fetch-sectors` | Sector allocation breakdown |
| `GET /sector-history` | Sector performance over time |
| `GET /index-history` | Benchmark index history |
| `GET /fetch-betas` | Beta calculations vs benchmarks |
| `GET /fetch-dividends` | Dividend data |
| `GET /currency-performance` | FX performance (CAD=X) |
| `POST /upload-nav` | Upload custom mutual fund NAV data |
| `GET /check-nav-lag` | Check for NAV reporting lag |
| `POST /save-portfolio-config` | Persist portfolio configuration |
| `GET /load-portfolio-config` | Load saved configuration |
| `POST /portfolio-backcast` | Historical backcasting analysis |

---

## Project Structure

```
server/
├── main.py                  # FastAPI app & all endpoints
├── market_data.py           # Return calculations, FX adjustment
├── data_loader.py           # Historic NAV CSV loading
├── cache_manager.py         # Market data cache (pickle)
├── fetch_price_history.py   # Yahoo Finance integration
├── index_scraper.py         # Index data scraping
├── constants.py             # Benchmarks, tickers, config
├── requirements.txt
└── data/
    ├── historic_navs/       # Mutual fund NAV CSVs
    ├── price_history/       # Cached price data
    ├── manual_navs.json     # Manually entered NAVs
    ├── portfolio_config.json
    ├── custom_sectors.json
    └── sector_history_cache.json
```

---

## How It Works

1. **Upload** — client sends portfolio weights (tickers × dates) via multipart form or JSON
2. **Fetch** — server pulls closing prices from Yahoo Finance; falls back to cached NAVs for mutual funds
3. **Calculate** — for each period between weight dates:
   - `Return = (P_end / P_start) - 1`
   - `Contribution = Weight × Return`
   - Non-CAD assets get FX-adjusted: `(1 + R_asset) × (1 + R_USD/CAD) - 1`
4. **Benchmarks** — S&P 500, Dow Jones, Nasdaq, ACWI, TSX60, USD/CAD are appended automatically
5. **Cache** — fetched prices are cached locally to speed up repeat requests

**Special cases:**
- `*cash*` ticker → forced 0% return in all periods
- Mutual fund NAVs → loaded from `data/historic_navs/` CSVs instead of Yahoo Finance
- All returns are expressed in **CAD**
