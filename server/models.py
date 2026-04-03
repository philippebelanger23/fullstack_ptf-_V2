"""Pydantic models for the portfolio analysis API."""

from typing import Dict, List, Optional

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


# ---------------------------------------------------------------------------
# Attribution sheet models
# ---------------------------------------------------------------------------

class PeriodBoundary(BaseModel):
    start: str  # ISO date YYYY-MM-DD
    end: str


class PeriodDetail(BaseModel):
    """One sub-period column: Weight_i, Return_i, Contrib_i."""

    weight: float  # percent-form weight (12.5 = 12.5%)
    returnPct: float  # decimal return (0.05 = 5%)
    contribution: float  # percentage-point contribution (0.5 = 0.50% = 50 bps)


class MonthDetail(BaseModel):
    """One monthly column: Return_i, Contrib_i (forward-compounded within month)."""

    returnPct: float  # decimal return (0.05 = 5%)
    contribution: float  # percentage-point contribution, forward-compounded within the month


class PeriodSheetRow(BaseModel):
    """One ticker row from the period-sheet."""

    ticker: str
    periods: List[PeriodDetail]
    ytdReturn: float  # geometric chain over all sub-periods
    ytdContrib: float  # percentage-point contribution, forward-compounded across all sub-periods


class MonthlySheetRow(BaseModel):
    """One ticker row from the monthly-sheet."""

    ticker: str
    months: List[MonthDetail]
    ytdReturn: float  # geometric chain of monthly returns
    ytdContrib: float  # percentage-point contribution, forward-compounded across months


class PortfolioAnalysisResponse(BaseModel):
    """Extended /analyze-manual response including both attribution sheets."""

    items: List[PortfolioItem]  # existing flat list used by the rest of the app
    periodSheet: List[PeriodSheetRow]  # per-sub-period detail
    monthlySheet: List[MonthlySheetRow]  # per-calendar-month detail
    periods: List[PeriodBoundary]  # sub-period boundaries
    monthlyPeriods: List[PeriodBoundary]  # monthly period boundaries
    benchmarkReturns: Dict[str, List[float]]  # {bench_name: [r_period_0, ...]}
    benchmarkMonthlyReturns: Dict[str, List[float]]  # {bench_name: [r_month_0, ...]}
