import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.portfolio import router as portfolio_router
from routes.market import router as market_router
from routes.index import router as index_router
from routes.config import router as config_router
from routes.risk import router as risk_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="price-refresh")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refresh price history cache in the background so startup is non-blocking.
    # refresh_if_needed() is a no-op when the cache is already fresh.
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor, _run_price_refresh)
    yield
    _executor.shutdown(wait=False)


def _run_price_refresh():
    try:
        from fetch_price_history import refresh_if_needed
        refresh_if_needed()
    except Exception as exc:
        logger.warning("startup price history refresh failed: %s", exc)


app = FastAPI(lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development (supports network IPs)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(portfolio_router)
app.include_router(market_router)
app.include_router(index_router)
app.include_router(config_router)
app.include_router(risk_router)


if __name__ == "__main__":
    import uvicorn

    # Fix for Windows asyncio loop policy (prevents "ConnectionResetError" and "ProactorBasePipeTransport" errors)
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_excludes=[
            ".cache/*",
            ".pytest_cache/*",
            "pytest-cache-files-*",
            "**/__pycache__/*",
            "server/data/*.json",
            "server/data/historic_navs/*.csv",
        ],
    )
