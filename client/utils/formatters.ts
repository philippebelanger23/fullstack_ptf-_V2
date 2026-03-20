/**
 * Shared formatting utilities used across views and chart components.
 */

/** Format a percentage with parentheses for negatives: 1.23% or (1.23%) */
export const formatPct = (val: number | undefined): string => {
    if (val === undefined || isNaN(val)) return '-';
    const abs = Math.abs(val);
    const str = `${abs.toFixed(2)}%`;
    return val < 0 ? `(${str})` : str;
};

/** Format a value as basis points with parentheses for negatives */
export const formatBps = (val: number | undefined): string => {
    if (val === undefined || isNaN(val)) return '-';
    const bps = Math.round(val * 100);
    const abs = Math.abs(bps);
    return val < 0 ? `(${abs})` : `${bps}`;
};

/** Format a percentage with explicit +/- sign: +1.23% or (1.23%) */
export const formatPercent = (val: number | undefined): string => {
    if (val === undefined) return 'N/A';
    if (val < 0) return `(${Math.abs(val).toFixed(2)}%)`;
    return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
};

/** Format a number (non-%) with parentheses for negatives: +1.23 or (1.23) */
export const formatNum = (val: number, decimals = 2): string => {
    if (val < 0) return `(${Math.abs(val).toFixed(decimals)})`;
    return `${val > 0 ? '+' : ''}${val.toFixed(decimals)}`;
};

/** Format a value with % and parentheses for negatives, no + prefix: 1.23% or (1.23%) */
export const formatPctSigned = (val: number, decimals = 2): string => {
    if (val < 0) return `(${Math.abs(val).toFixed(decimals)}%)`;
    return `${val > 0 ? '+' : ''}${val.toFixed(decimals)}%`;
};

/** Format a date string for X-axis display. Supports multi-year and short periods. */
export const formatXAxis = (str: string, period?: string): string => {
    const date = new Date(str);
    const month = date.getMonth();
    const year = date.getFullYear();

    if (period === '3Y' || period === '5Y') {
        if (month === 0) return year.toString();
        return '';
    }

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date);
    if (month === 0) {
        return `${monthName} '${year.toString().slice(-2)}`;
    }
    return monthName;
};

/** Format a date string for tooltip display: "Mar 17, 2026" */
export const formatTooltipDate = (str: string): string => {
    const date = new Date(str);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

/** Get CSS color class based on a numeric value (positive/negative/zero) */
export const getPerformanceColor = (val: number | undefined): string => {
    if (val === undefined) return 'text-slate-400';
    if (val > 0) return 'text-green-600';
    if (val < 0) return 'text-red-500';
    return 'text-slate-500';
};
