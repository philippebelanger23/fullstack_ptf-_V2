export interface PortfolioItem {
  ticker: string;
  weight: number; // percent-form (12.5 = 12.5%)
  date: string;
  periodIndex?: number; // stable canonical sub-period index
  periodStart?: string; // canonical boundary start date
  periodEnd?: string; // canonical boundary end date
  periodKey?: string; // `${periodStart}|${periodEnd}`
  companyName?: string;
  sector?: string;
  notes?: string;
  returnPct?: number; // decimal return (0.05 = 5%)
  contribution?: number; // percentage-point contribution (0.5 = 0.50% = 50 bps)
  isMutualFund?: boolean; // Flag for mutual funds requiring CSV NAV data
  isEtf?: boolean; // Flag for ETFs
  isCash?: boolean; // Flag for cash equivalents
  sectorWeights?: Record<string, number>; // Custom sector breakdown percentage
  startPrice?: number; // Price at start of sub-period
  endPrice?: number; // Price at end of sub-period
  priceCovered?: boolean; // true when both canonical boundary prices were resolved
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

export interface CorrelationData {
  tickers: string[];
  matrix: number[][];
  analysis: string;
}

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

// Per-period, per-ticker attribution derived from the backcast daily series.
// Shaped like PortfolioItem so it can be merged directly into portfolioData.
export interface PeriodAttributionItem {
  ticker: string;
  date: string;
  weight: number; // percent-form (10.0 = 10%)
  returnPct: number; // decimal return (0.05 = 5%)
  contribution: number; // percentage-point contribution (0.5 = 0.50% = 50 bps)
  isCash?: boolean;
}

export interface BackcastResponse {
  metrics: BackcastMetrics;
  series: BackcastSeriesPoint[];
  missingTickers: string[];
  topDrawdowns?: DrawdownEpisode[];
  fetchedAt?: string;
  error?: string;
  periodAttribution?: PeriodAttributionItem[];
}

export interface RiskPosition {
  ticker: string;
  sector: string;
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
  portfolioBeta: number;
  diversificationRatio: number;
  concentrationRatio: number;
  numEffectiveBets: number;
  top3Concentration: number;
  var95: number;
  cvar95: number;
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

// ---------------------------------------------------------------------------
// Attribution sheet types
// ---------------------------------------------------------------------------

export interface PeriodBoundary {
  start: string; // ISO date YYYY-MM-DD
  end: string;
}

export interface PeriodDetail {
  weight: number; // percent-form weight (12.5 = 12.5%)
  returnPct: number; // decimal return (0.05 = 5%)
  contribution: number; // percentage-point contribution (0.5 = 0.50% = 50 bps)
}

export interface MonthDetail {
  returnPct: number; // decimal return (0.05 = 5%)
  contribution: number; // percentage-point contribution, forward-compounded within the month
}

export interface PeriodSheetRow {
  ticker: string;
  periods: PeriodDetail[];
  ytdReturn: number; // geometric chain over all sub-periods
  ytdContrib: number; // percentage-point contribution, forward-compounded across all sub-periods
}

export interface MonthlySheetRow {
  ticker: string;
  months: MonthDetail[];
  ytdReturn: number; // geometric chain of monthly returns
  ytdContrib: number; // percentage-point contribution, forward-compounded across months
}

export interface PortfolioAnalysisResponse {
  items: PortfolioItem[]; // flat list used by all other views
  periodItems?: PortfolioItem[]; // lossless per-period holding rows
  periodSheet: PeriodSheetRow[]; // sub-period granularity
  monthlySheet: MonthlySheetRow[]; // calendar-month granularity
  periods: PeriodBoundary[]; // sub-period date boundaries
  monthlyPeriods: PeriodBoundary[]; // monthly period boundaries
  benchmarkReturns: Record<string, number[]>; // {bench_name: [r_period_0, ...]}
  benchmarkMonthlyReturns: Record<string, number[]>; // {bench_name: [r_month_0, ...]}
}

export type SectorHistoryData = Record<string, { date: string; value: number }[]>;

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

export interface PortfolioWorkspaceInput {
  normalizedDates: string[];
  activeTickers: string[];
  latestHoldingsDate: string | null;
}

export interface PortfolioWorkspaceTimeline {
  expandedDates: string[];
  periods: PeriodBoundary[];
  monthlyPeriods: PeriodBoundary[];
}

export interface PortfolioWorkspaceHoldings {
  periodItems: PortfolioItem[];
  items: PortfolioItem[];
  latestItems: PortfolioItem[];
}

export interface TopContributorRow {
  ticker: string;
  weight: number;
  returnPct: number;
  contribution: number;
}

export interface TopContributorTable {
  label: string;
  rows: TopContributorRow[];
}

export interface TopContributorLayout {
  monthlyTables: TopContributorTable[];
  quarterTable: TopContributorTable | null;
}

export interface AttributionWaterfallBar {
  name: string;
  value: [number, number];
  delta: number;
  isTotal: boolean;
  weight?: number;
  totalReturn?: number;
  sector?: string | null;
  companyName?: string | null;
  isEtf?: boolean;
  isMutualFund?: boolean;
}

export interface AttributionWaterfallLayout {
  bars: AttributionWaterfallBar[];
  domain: [number, number];
  portfolioReturn: number;
}

export interface SectorAttributionStock {
  ticker: string;
  returnPct: number;
  weight: number;
  selectionContribution: number;
}

export interface SectorAttributionRow {
  sector: string;
  displayName: string;
  benchmarkETF: string;
  selectionEffect: number;
  allocationEffect: number;
  interactionEffect: number;
  benchmarkReturn: number;
  benchmarkWeight: number;
  portfolioWeight: number;
  portfolioReturn: number;
  hasDirectHoldings: boolean;
  stocks: SectorAttributionStock[];
}

export interface SectorAttributionLayout {
  data: SectorAttributionRow[];
  selectionDomain: [number, number];
  allocationDomain: [number, number];
  interactionDomain: [number, number];
}

export interface AttributionOverviewRangeLayout {
  waterfall: AttributionWaterfallLayout;
  sectorAttribution: Record<string, Record<string, SectorAttributionLayout>>;
}

export interface PortfolioWorkspaceAttribution extends PortfolioAnalysisResponse {
  topContributors: TopContributorLayout[];
  overviewLayouts?: Record<string, Record<string, AttributionOverviewRangeLayout>>;
  portfolioPeriodReturns: Record<string, number>;
  portfolioMonthlyReturns: Record<string, number>;
  portfolioYtdReturn: number;
}

export interface PerformanceWorkspaceSection {
  defaultBenchmark: string;
  variants: Record<string, BackcastResponse>;
  rollingMetrics: Record<string, RollingMetricsResponse>;
}

export interface MutualFundTraceRow {
  startDate?: string;
  endDate?: string;
  label?: string;
  weight?: number;
  priceStart?: number | null;
  priceEnd?: number | null;
  startValue?: number | null;
  endValue?: number | null;
  returnPct: number;
  contribution: number;
  needsFx?: boolean;
  priceCovered?: boolean;
}

export interface MutualFundTrace {
  rawNavInputs: { date: string | null; nav: number }[];
  reportingBoundaries: (string | null)[];
  resolvedBoundaryPrices: { date: string | null; value: number | null }[];
  subperiodRows: MutualFundTraceRow[];
  monthlyRows: MutualFundTraceRow[];
  quarterRows: MutualFundTraceRow[];
  ytdRow: MutualFundTraceRow;
}

export interface PortfolioWorkspaceAudit {
  navAudit: Record<string, { date: string; nav: number; source: string; returnPct: number | null }[]>;
  mutualFundTraces: Record<string, MutualFundTrace>;
  coverage: {
    missingBoundaryPrices: { ticker: string; start: string | null; end: string | null }[];
  };
}

export interface PortfolioWorkspaceResponse {
  input: PortfolioWorkspaceInput;
  timeline: PortfolioWorkspaceTimeline;
  holdings: PortfolioWorkspaceHoldings;
  attribution: PortfolioWorkspaceAttribution;
  performance: PerformanceWorkspaceSection;
  risk: RiskContributionResponse;
  audit: PortfolioWorkspaceAudit;
}
