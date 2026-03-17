"""Pydantic models for the portfolio analysis API."""

from typing import List, Optional
from pydantic import BaseModel


class PortfolioItem(BaseModel):
    ticker: str
    weight: float
    date: str
    companyName: Optional[str] = None
    sector: Optional[str] = None
    notes: Optional[str] = None
    returnPct: Optional[float] = None
    contribution: Optional[float] = None
    isMutualFund: Optional[bool] = None  # Flag for mutual funds requiring CSV NAV data
    isEtf: Optional[bool] = None  # Flag for ETFs
    sectorWeights: Optional[dict] = None  # Custom sector breakdowns percentage (e.g. {"Technology": 10.0})


class TickerRow(BaseModel):
    ticker: str
    isMutualFund: bool = False
    isEtf: bool = False


class AllocationPeriod(BaseModel):
    id: str
    startDate: str
    endDate: str
    weights: dict


class PortfolioConfig(BaseModel):
    tickers: List[TickerRow]
    periods: List[AllocationPeriod]


class ManualAnalysisRequest(BaseModel):
    items: List[PortfolioItem]


class BackcastRequest(BaseModel):
    items: List[PortfolioItem]
