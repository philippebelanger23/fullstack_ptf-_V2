import sys
import asyncio
import logging

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

app = FastAPI()

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

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
