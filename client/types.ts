export interface PortfolioItem {
  ticker: string;
  weight: number;
  date: string;
  companyName?: string;
  sector?: string;
  notes?: string;
  returnPct?: number;
  contribution?: number;
  isMutualFund?: boolean; // Flag for mutual funds requiring CSV NAV data
  isEtf?: boolean; // Flag for ETFs
  isCash?: boolean; // Flag for cash equivalents
  sectorWeights?: Record<string, number>; // Custom sector breakdown percentage
}

export interface AnalysisState {
  status: 'idle' | 'analyzing' | 'complete' | 'error';
  markdownResult: string;
  riskScore?: number;
  lastUpdated?: Date;
}

export enum ViewState {
  UPLOAD = 'UPLOAD',
  DASHBOARD = 'DASHBOARD',
  INDEX = 'INDEX',
  ANALYSIS = 'ANALYSIS',
  CORRELATION = 'CORRELATION',
  ATTRIBUTION = 'ATTRIBUTION',
  PERFORMANCE = 'PERFORMANCE',
  RISK_CONTRIBUTION = 'RISK_CONTRIBUTION'
}

// Correlation types
export interface CorrelationData {
  tickers: string[];
  matrix: number[][];
  analysis: string;
}

// Backcast / Performance types
export interface BackcastMetrics {
  totalReturn: number;
  benchmarkReturn: number;
  alpha: number;
  sharpeRatio: number;
  sortinoRatio: number;
  informationRatio: number;
  trackingError: number;
  volatility: number;
  beta: number;
  maxDrawdown: number;
  benchmarkMaxDrawdown: number;
  benchmarkVolatility: number;
  benchmarkSharpe: number;
  benchmarkSortino: number;
}

export interface BackcastSeriesPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface DrawdownEpisode {
  start: string;
  trough: string;
  recovery: string | null;
  depth: number; // negative %, e.g. -8.5
  durationDays: number;
  recoveryDays: number | null;
}

export interface BackcastResponse {
  metrics: BackcastMetrics;
  series: BackcastSeriesPoint[];
  missingTickers: string[];
  topDrawdowns?: DrawdownEpisode[];
  fetchedAt?: string;
  error?: string;
}

// Risk Contribution types
export interface RiskPosition {
  ticker: string;
  weight: number;
  individualVol: number;
  beta: number;
  mctr: number;
  componentRisk: number;
  pctOfTotalRisk: number;
  annualizedReturn: number;
  riskAdjustedReturn: number;
}

export interface SectorRisk {
  sector: string;
  weight: number;
  riskContribution: number;
}

export interface RiskContributionResponse {
  portfolioVol: number;
  benchmarkVol: number;
  diversificationRatio: number;
  concentrationRatio: number;
  numEffectiveBets: number;
  top3Concentration: number;
  positions: RiskPosition[];
  sectorRisk: SectorRisk[];
  correlationMatrix?: {
    tickers: string[];
    matrix: number[][];
  };
  missingTickers: string[];
  fetchedAt?: string;
  error?: string;
}

// Sector History types
export type SectorHistoryData = Record<string, { date: string; value: number }[]>;

// Rolling Metrics types
export interface RollingMetricPoint {
  date: string;
  portfolio: { sharpe: number; vol: number; beta: number };
  benchmark: { sharpe: number; vol: number; beta: number };
}

export interface RollingMetricsResponse {
  windows: {
    21: RollingMetricPoint[];
    63: RollingMetricPoint[];
    126: RollingMetricPoint[];
  };
  error?: string;
}