import type {
    PeriodBoundary,
    PerformancePeriod,
    PerformanceSeriesPoint,
    PerformanceVariantResponse,
    PerformanceWindowRange,
    PerformanceWorkspaceSection,
} from '../types';

export type PerformanceChartView = 'absolute' | 'relative' | 'drawdowns';
type AttributionOverviewRange = 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type PerformanceChartPoint =
    | { date: string; Portfolio: number; Benchmark: number }
    | { date: string; 'Excess Return': number };

const ATTRIBUTION_QUARTER_MONTHS: Record<Exclude<AttributionOverviewRange, 'YTD'>, number[]> = {
    Q1: [0, 1, 2],
    Q2: [3, 4, 5],
    Q3: [6, 7, 8],
    Q4: [9, 10, 11],
};

const monthKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`;
const getTodayIsoDate = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.toISOString().split('T')[0];
};

const sanitizePerformanceSeries = (
    series: PerformanceSeriesPoint[] | null | undefined,
): PerformanceSeriesPoint[] => {
    if (!series?.length) return [];

    const todayIso = getTodayIsoDate();
    const byDate = new Map<string, PerformanceSeriesPoint>();

    series.forEach((point) => {
        if (!point || typeof point.date !== 'string' || point.date > todayIso) return;
        if (!Number.isFinite(point.portfolio) || !Number.isFinite(point.benchmark)) return;
        if (point.portfolio <= 0 || point.benchmark <= 0) return;
        byDate.set(point.date, {
            date: point.date,
            portfolio: point.portfolio,
            benchmark: point.benchmark,
        });
    });

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

export const filterSeriesByWindowRange = (
    series: PerformanceSeriesPoint[] | null | undefined,
    windowRange: PerformanceWindowRange | null | undefined,
): PerformanceSeriesPoint[] => {
    if (!series?.length) return [];
    const startDateStr = windowRange?.start;
    if (!startDateStr) return sanitizePerformanceSeries(series);
    const todayIso = getTodayIsoDate();
    const endDateStr = windowRange?.end
        ? [windowRange.end, todayIso].sort()[0]
        : todayIso;
    const sanitizedSeries = sanitizePerformanceSeries(series);
    const inWindow = sanitizedSeries.filter(point => point.date >= startDateStr && point.date <= endDateStr);
    if (inWindow.length === 0) return [];
    if (inWindow[0].date === startDateStr) return inWindow;

    const anchorPoint = [...sanitizedSeries]
        .reverse()
        .find(point => point.date < startDateStr);

    if (!anchorPoint) return inWindow;

    return [
        {
            ...anchorPoint,
            date: startDateStr,
        },
        ...inWindow,
    ];
};

export const buildChartDataFromSeries = (
    filteredSeries: PerformanceSeriesPoint[],
    chartView: PerformanceChartView,
): PerformanceChartPoint[] => {
    const sanitizedSeries = sanitizePerformanceSeries(filteredSeries);
    if (sanitizedSeries.length === 0) return [];

    const startPortfolio = sanitizedSeries[0].portfolio;
    const startBenchmark = sanitizedSeries[0].benchmark;

    if (chartView === 'absolute') {
        return sanitizedSeries.map(point => ({
            date: point.date,
            Portfolio: ((point.portfolio - startPortfolio) / startPortfolio) * 100,
            Benchmark: ((point.benchmark - startBenchmark) / startBenchmark) * 100,
        }));
    }

    if (chartView === 'relative') {
        return sanitizedSeries.map(point => {
            const portfolioReturn = ((point.portfolio - startPortfolio) / startPortfolio) * 100;
            const benchmarkReturn = ((point.benchmark - startBenchmark) / startBenchmark) * 100;
            return {
                date: point.date,
                'Excess Return': portfolioReturn - benchmarkReturn,
            };
        });
    }

    let maxPortfolio = sanitizedSeries[0].portfolio;
    let maxBenchmark = sanitizedSeries[0].benchmark;
    return sanitizedSeries.map(point => {
        maxPortfolio = Math.max(maxPortfolio, point.portfolio);
        maxBenchmark = Math.max(maxBenchmark, point.benchmark);
        return {
            date: point.date,
            Portfolio: ((point.portfolio - maxPortfolio) / maxPortfolio) * 100,
            Benchmark: ((point.benchmark - maxBenchmark) / maxBenchmark) * 100,
        };
    });
};

export const buildPerformanceSeries = (
    variant: PerformanceVariantResponse | null | undefined,
): PerformanceSeriesPoint[] => {
    return sanitizePerformanceSeries(variant?.series);
};

export const buildPerformanceWindowRange = (
    variant: PerformanceVariantResponse | null | undefined,
    period: PerformancePeriod,
): PerformanceWindowRange | null => {
    return variant?.windowRanges?.[period] ?? null;
};

export const buildPortfolioMonthlyPerformanceMap = (
    performanceSection: PerformanceWorkspaceSection | null | undefined,
    monthlyPeriods: PeriodBoundary[] | null | undefined,
    allMonths: Date[],
    selectedYear: number,
    selectedRange: AttributionOverviewRange,
): Record<string, number | null> => {
    const valuesByMonth: Record<string, number | null> = {};
    allMonths.forEach((date) => {
        valuesByMonth[monthKey(date)] = null;
    });

    if (!monthlyPeriods?.length) return valuesByMonth;

    const monthlyReturns = performanceSection?.portfolio.monthlyReturns ?? {};
    for (const period of monthlyPeriods) {
        const endDate = new Date(`${period.end}T00:00:00`);
        const endMonth = endDate.getMonth();
        const isSelectedQuarter = selectedRange === 'YTD' || ATTRIBUTION_QUARTER_MONTHS[selectedRange].includes(endMonth);
        if (endDate.getFullYear() !== selectedYear || !isSelectedQuarter) continue;

        const returnKey = `${period.start}|${period.end}`;
        const returnValue = monthlyReturns[returnKey];
        valuesByMonth[monthKey(new Date(selectedYear, endMonth, 1))] = typeof returnValue === 'number' ? returnValue * 100 : null;
    }

    return valuesByMonth;
};
