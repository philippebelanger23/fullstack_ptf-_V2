"""Constants for portfolio returns analysis."""

# Cache settings
CACHE_DIR = ".cache"
CACHE_FILE = ".cache/market_data_cache.pkl"

# Benchmark tickers
BENCHMARK_TICKERS = {
    "USD/CAD": "CAD=X",
    "S&P 500": "^GSPC",
    "Dow Jones": "^DJI",
    "Nasdaq": "^IXIC",
    "ACWI": "ACWI",
    "TSX": "^GSPTSE"
}

BENCHMARK_ORDER = ["USD/CAD", "S&P 500", "Dow Jones", "Nasdaq", "ACWI", "TSX"]

# Special tickers
CASH_TICKER = "*CASH*"
BASE_CURRENCY = "CAD"
FX_TICKER = "CAD=X"

# Define indices and FX
INDICES = {"^GSPC", "^DJI", "^IXIC", "ACWI", "^GSPTSE"}
FX_TICKERS = {"CAD=X"}

# Benchmark blend composition (75/25 composite: 75% ACWI in CAD + 25% XIC.TO)
BENCHMARK_BLEND_WEIGHTS = {"ACWI": 0.75, "XIC": 0.25}
BENCHMARK_BLEND_TICKERS = ["ACWI", "XIC.TO", "XUS.TO", "USDCAD=X"]

