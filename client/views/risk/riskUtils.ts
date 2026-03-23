import { RiskPosition } from '../../types';

/* ── Shared types for risk chart components ── */

export interface RiskBarDataPoint {
    ticker: string;
    riskPct: number;
    weight: number;
    delta: number;
    beta?: number;
    mctr?: number;
    individualVol?: number;
    annualizedReturn?: number;
    riskAdjustedReturn?: number;
}

export interface ScatterDataPoint {
    ticker: string;
    x: number;   // pctOfTotalRisk
    y: number;   // annualizedReturn
    weight: number;
}

/* ── Color helpers ── */

/** Diverging color scale: red (negative) → neutral → green (positive) */
export function riskAdjReturnColor(value: number, isDark: boolean): string {
    if (!isFinite(value) || value == null) return isDark ? '#374151' : '#cbd5e1';
    const clamped = Math.max(-2, Math.min(2, value));
    const t = (clamped + 2) / 4; // 0..1
    if (t < 0.5) {
        // red zone
        const r = isDark ? 220 : 239;
        const g = isDark ? Math.round(50 + t * 120) : Math.round(68 + t * 140);
        const b = isDark ? Math.round(50 + t * 80) : Math.round(68 + t * 100);
        return `rgb(${r}, ${g}, ${b})`;
    }
    // green zone
    const r = isDark ? Math.round(220 - (t - 0.5) * 300) : Math.round(239 - (t - 0.5) * 340);
    const g = isDark ? Math.round(170 + (t - 0.5) * 60) : Math.round(180 + (t - 0.5) * 40);
    const b = isDark ? Math.round(80 - (t - 0.5) * 40) : Math.round(100 - (t - 0.5) * 60);
    return `rgb(${Math.max(0, r)}, ${Math.min(255, g)}, ${Math.max(0, b)})`;
}

/** Correlation color: 5-stop scale for max discrimination across 0..1 range.
 *  green → yellow-green → yellow → orange → red  (maps 0..1) */
export function correlationColor(value: number, isDark: boolean): string {
    const v = Math.max(0, Math.min(1, value));
    const t = v; // already 0..1

    type RGB = [number, number, number];
    const stops: RGB[] = isDark
        ? [
            [22,  160,  60],   // t=0    dark green
            [110, 175,  40],   // t=0.25 yellow-green
            [210, 160,  15],   // t=0.5  yellow
            [220,  90,  15],   // t=0.75 orange
            [205,  35,  35],   // t=1    red
          ]
        : [
            [34,  197,  94],   // t=0    green
            [120, 195,  50],   // t=0.25 yellow-green
            [234, 179,   8],   // t=0.5  yellow
            [249, 115,  22],   // t=0.75 orange
            [220,  38,  38],   // t=1    red
          ];

    const seg = Math.min(Math.floor(t * 4), 3); // 0–3
    const s = t * 4 - seg;                       // 0..1 within segment
    const [r1, g1, b1] = stops[seg];
    const [r2, g2, b2] = stops[seg + 1];
    return `rgb(${Math.round(r1 + s * (r2 - r1))}, ${Math.round(g1 + s * (g2 - g1))}, ${Math.round(b1 + s * (b2 - b1))})`;
}

/* ── Data transforms ── */

export function buildRiskBarData(positions: RiskPosition[]): RiskBarDataPoint[] {
    return [...positions]
        .sort((a, b) => b.pctOfTotalRisk - a.pctOfTotalRisk)
        .map(p => ({
            ticker: p.ticker,
            riskPct: p.pctOfTotalRisk,
            weight: p.weight,
            delta: +(p.pctOfTotalRisk - p.weight).toFixed(1),
            beta: p.beta,
            mctr: p.mctr,
            individualVol: p.individualVol,
            annualizedReturn: p.annualizedReturn,
            riskAdjustedReturn: p.riskAdjustedReturn,
        }));
}

export function buildScatterData(positions: RiskPosition[]): ScatterDataPoint[] {
    return positions.map(p => ({
        ticker: p.ticker,
        x: p.pctOfTotalRisk,
        y: p.annualizedReturn,
        weight: p.weight,
    }));
}
