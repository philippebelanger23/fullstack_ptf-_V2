"""Pydantic models for the portfolio analysis API."""

from typing import List, Optional

from pydantic import BaseModel


class PortfolioItem(BaseModel):
    ticker: str
    weight: float  # percent-form (12.5 = 12.5%)
    date: str
    companyName: Optional[str] = None
    sector: Optional[str] = None
    notes: Optional[str] = None
    returnPct: Optional[float] = None  # decimal return (0.05 = 5%)
    contribution: Optional[float] = None  # percentage-point contribution (0.5 = 0.50% = 50 bps)
    isMutualFund: Optional[bool] = None  # Flag for mutual funds requiring CSV NAV data
    isEtf: Optional[bool] = None  # Flag for ETFs
    isCash: Optional[bool] = None  # Flag for cash equivalents
    sectorWeights: Optional[dict] = None  # Custom sector breakdown percentage (e.g. {"Technology": 10.0})
    startPrice: Optional[float] = None  # Price at start of sub-period (for direct return calc)
    endPrice: Optional[float] = None  # Price at end of sub-period (for direct return calc)


class TickerRow(BaseModel):
    ticker: str
    isMutualFund: bool = False
    isEtf: bool = False
    isCash: bool = False


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
    benchmark: str = "75/25"  # "75/25" | "TSX" | "SP500" | "ACWI"
    includeAttribution: bool = False  # when True, response includes periodAttribution list

