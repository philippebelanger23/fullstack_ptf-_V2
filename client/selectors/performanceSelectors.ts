import type { PerformanceSeriesPoint, PortfolioWorkspaceAttribution } from '../types';
import type { Period, PeriodMetrics } from '../views/performance/PerformanceKPIs';
import { getDateRangeForPeriod } from '../utils/dateUtils';

export type PerformanceChartView = 'absolute' | 'relative' | 'drawdowns';

export type PerformanceChartPoint =
    | { date: string; Portfolio: number; Benchmark: number }
    | { date: string; 'Excess Return': number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const sampleStdDev = (values: number[]) => {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
};

const covariance = (left: number[], right: number[]) => {
    if (left.length < 2) return 0;
    const leftMean = mean(left);
    const rightMean = mean(right);
    return left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0) / (left.length - 1);
};

const downsideDeviation = (values: number[]) => {
    const sumSquares = values.reduce((sum, value) => sum + Math.min(value, 0) ** 2, 0);
    return Math.sqrt(sumSquares / values.length);
};

export const filterSeriesByPeriod = (
    series: PerformanceSeriesPoint[] | null | undefined,
    selectedPeriod: Period,
): PerformanceSeriesPoint[] => {
    if (!series?.length) return [];
    const { start, end } = getDateRangeForPeriod(selectedPeriod);
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end ? end.toISOString().split('T')[0] : '9999-12-31';
    return series.filter(point => point.date >= startDateStr && point.date <= endDateStr);
};

export const buildChartDataFromSeries = (
    filteredSeries: PerformanceSeriesPoint[],
    chartView: PerformanceChartView,
): PerformanceChartPoint[] => {
    if (filteredSeries.length === 0) return [];

    const startPortfolio = filteredSeries[0].portfolio;
    const startBenchmark = filteredSeries[0].benchmark;

    if (chartView === 'absolute') {
        return filteredSeries.map(point => ({
            date: point.date,
            Portfolio: ((point.portfolio - startPortfolio) / startPortfolio) * 100,
            Benchmark: ((point.benchmark - startBenchmark) / startBenchmark) * 100,
        }));
    }

    if (chartView === 'relative') {
        return filteredSeries.map(point => {
            const portfolioReturn = ((point.portfolio - startPortfolio) / startPortfolio) * 100;
            const benchmarkReturn = ((point.benchmark - startBenchmark) / startBenchmark) * 100;
            return {
                date: point.date,
                'Excess Return': portfolioReturn - benchmarkReturn,
            };
        });
    }

    let maxPortfolio = filteredSeries[0].portfolio;
    let maxBenchmark = filteredSeries[0].benchmark;
    return filteredSeries.map(point => {
        maxPortfolio = Math.max(maxPortfolio, point.portfolio);
        maxBenchmark = Math.max(maxBenchmark, point.benchmark);
        return {
            date: point.date,
            Portfolio: ((point.portfolio - maxPortfolio) / maxPortfolio) * 100,
            Benchmark: ((point.benchmark - maxBenchmark) / maxBenchmark) * 100,
        };
    });
};

export const computePeriodMetricsFromSeries = (
    filteredSeries: PerformanceSeriesPoint[],
): PeriodMetrics | null => {
    if (filteredSeries.length < 5) return null;

    const portfolioReturns: number[] = [];
    const benchmarkReturns: number[] = [];
    for (let index = 1; index < filteredSeries.length; index += 1) {
        portfolioReturns.push(
            (filteredSeries[index].portfolio - filteredSeries[index - 1].portfolio) / filteredSeries[index - 1].portfolio,
        );
        benchmarkReturns.push(
            (filteredSeries[index].benchmark - filteredSeries[index - 1].benchmark) / filteredSeries[index - 1].benchmark,
        );
    }

    if (portfolioReturns.length === 0) return null;

    const portfolioStdDev = sampleStdDev(portfolioReturns);
    const benchmarkStdDev = sampleStdDev(benchmarkReturns);
    const portfolioMean = mean(portfolioReturns);
    const benchmarkMean = mean(benchmarkReturns);
    const benchmarkVariance = benchmarkStdDev ** 2;

    const totalReturn = ((filteredSeries[filteredSeries.length - 1].portfolio - filteredSeries[0].portfolio) / filteredSeries[0].portfolio) * 100;
    const benchmarkReturn = ((filteredSeries[filteredSeries.length - 1].benchmark - filteredSeries[0].benchmark) / filteredSeries[0].benchmark) * 100;

    const volatility = portfolioStdDev * Math.sqrt(252) * 100;
    const benchmarkVolatility = benchmarkStdDev * Math.sqrt(252) * 100;
    const sharpeRatio = portfolioStdDev > 0 ? (portfolioMean / portfolioStdDev) * Math.sqrt(252) : 0;
    const benchmarkSharpe = benchmarkStdDev > 0 ? (benchmarkMean / benchmarkStdDev) * Math.sqrt(252) : 0;
    const portfolioDownsideDeviation = downsideDeviation(portfolioReturns);
    const benchmarkDownsideDeviation = downsideDeviation(benchmarkReturns);
    const sortinoRatio = portfolioDownsideDeviation > 0 ? (portfolioMean / portfolioDownsideDeviation) * Math.sqrt(252) : 0;
    const benchmarkSortino = benchmarkDownsideDeviation > 0 ? (benchmarkMean / benchmarkDownsideDeviation) * Math.sqrt(252) : 0;
    const beta = benchmarkVariance > 0 ? covariance(portfolioReturns, benchmarkReturns) / benchmarkVariance : 1;

    const excessReturns = portfolioReturns.map((value, index) => value - benchmarkReturns[index]);
    const trackingError = sampleStdDev(excessReturns) * Math.sqrt(252) * 100;
    const informationRatio = trackingError > 0 ? ((mean(excessReturns) * 252) * 100) / trackingError : 0;

    let maxPortfolio = filteredSeries[0].portfolio;
    let maxDrawdown = 0;
    let maxBenchmark = filteredSeries[0].benchmark;
    let benchmarkMaxDrawdown = 0;
    for (const point of filteredSeries) {
        maxPortfolio = Math.max(maxPortfolio, point.portfolio);
        maxDrawdown = Math.min(maxDrawdown, (point.portfolio - maxPortfolio) / maxPortfolio);
        maxBenchmark = Math.max(maxBenchmark, point.benchmark);
        benchmarkMaxDrawdown = Math.min(benchmarkMaxDrawdown, (point.benchmark - maxBenchmark) / maxBenchmark);
    }

    return {
        totalReturn,
        benchmarkReturn,
        alpha: totalReturn - benchmarkReturn,
        sharpeRatio,
        sortinoRatio,
        informationRatio,
        trackingError,
        volatility,
        benchmarkVolatility,
        benchmarkSharpe,
        benchmarkSortino,
        beta,
        maxDrawdown: maxDrawdown * 100,
        benchmarkMaxDrawdown: benchmarkMaxDrawdown * 100,
    };
};

export const buildCanonicalPerformanceSeries = (
    attribution: PortfolioWorkspaceAttribution | null | undefined,
    benchmark: string,
): PerformanceSeriesPoint[] => {
    return attribution?.dailyPerformanceSeries?.[benchmark] ?? [];
};
