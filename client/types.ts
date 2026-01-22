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
  PERFORMANCE = 'PERFORMANCE'
}