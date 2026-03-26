import React, { useMemo, useState } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine, ReferenceArea, ZAxis, Line,
    ComposedChart,
} from 'recharts';
import { useThemeColors } from '../../hooks/useThemeColors';
import { ScatterDataPoint } from './riskUtils';

type ScatterMode = 'return' | 'weight';

interface ReturnRiskScatterProps {
    data: ScatterDataPoint[];
    loading: boolean;
}

export const ReturnRiskScatter: React.FC<ReturnRiskScatterProps> = ({ data, loading }) => {
    const tc = useThemeColors();
    const [mode, setMode] = useState<ScatterMode>('return');

    /* ── Tight axis helper: pad range by 10%, floor min to 0 if close ── */
    const padRange = (min: number, max: number, frac = 0.10) => {
        const span = max - min || 1;
        const lo = min - span * frac;
        const hi = max + span * frac;
        return { lo: lo < span * 0.15 ? 0 : lo, hi };
    };

    /* ── Return vs Risk stats ── */
    const returnStats = useMemo(() => {
        if (data.length === 0) return { medianRisk: 0, medianReturn: 0, xMin: 0, xMax: 10, yMin: -10, yMax: 10 };
        const sortedX = [...data].sort((a, b) => a.x - b.x);
        const sortedY = [...data].sort((a, b) => a.y - b.y);
        const mid = Math.floor(data.length / 2);
        const medianRisk = data.length % 2 ? sortedX[mid].x : (sortedX[mid - 1].x + sortedX[mid].x) / 2;
        const medianReturn = data.length % 2 ? sortedY[mid].y : (sortedY[mid - 1].y + sortedY[mid].y) / 2;
        const x = padRange(sortedX[0].x, sortedX[sortedX.length - 1].x);
        const y = padRange(sortedY[0].y, sortedY[sortedY.length - 1].y);
        return { medianRisk, medianReturn, xMin: x.lo, xMax: x.hi, yMin: y.lo, yMax: y.hi };
    }, [data]);

    /* ── Weight vs Risk stats ── */
    const weightStats = useMemo(() => {
        if (data.length === 0) return { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
        const xs = data.map(d => d.x);
        const ys = data.map(d => d.weight);
        const x = padRange(Math.min(...xs), Math.max(...xs));
        const y = padRange(Math.min(...ys), Math.max(...ys));
        return { xMin: x.lo, xMax: x.hi, yMin: y.lo, yMax: y.hi };
    }, [data]);

    /* ── Fair share diagonal line data (two corner points) ── */
    const fairShareLine = useMemo(() => {
        const lo = Math.min(weightStats.xMin, weightStats.yMin);
        const hi = Math.max(weightStats.xMax, weightStats.yMax);
        return [{ x: lo, weight: lo }, { x: hi, weight: hi }];
    }, [weightStats]);

    if (loading) return <ChartSkeleton />;

    return (
        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">
                        {mode === 'return' ? 'Return vs Risk' : 'Weight vs Risk'}
                    </h3>
                    <p className="text-[11px] text-wallstreet-500 mt-0.5">
                        {mode === 'return'
                            ? 'Quadrant analysis — size = weight, crosshairs = median'
                            : 'Fair share line — dots above = overweight vs risk'}
                    </p>
                </div>
                <div className="flex items-center bg-wallstreet-900 rounded-lg p-0.5">
                    {(['return', 'weight'] as const).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${
                                mode === m
                                    ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                                    : 'text-wallstreet-500 hover:text-wallstreet-text'
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            {data.length === 0 ? (
                <div className="h-[350px] flex items-center justify-center text-wallstreet-500 text-sm">No data</div>
            ) : mode === 'return' ? (
                /* ── Return vs Risk (quadrant) ── */
                <ResponsiveContainer width="100%" height={380}>
                    <ScatterChart margin={{ left: 0, right: 10, top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} />

                        {/* Quadrant shading — use extreme bounds so Recharts clips to visible area */}
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={-9999} x2={returnStats.medianRisk} y1={returnStats.medianReturn} y2={9999} fill="#22c55e" fillOpacity={0.03} stroke="none" ifOverflow="hidden" />
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={returnStats.medianRisk} x2={9999} y1={returnStats.medianReturn} y2={9999} fill="#f59e0b" fillOpacity={0.03} stroke="none" ifOverflow="hidden" />
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={-9999} x2={returnStats.medianRisk} y1={-9999} y2={returnStats.medianReturn} fill="#94a3b8" fillOpacity={0.02} stroke="none" ifOverflow="hidden" />
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={returnStats.medianRisk} x2={9999} y1={-9999} y2={returnStats.medianReturn} fill="#ef4444" fillOpacity={0.03} stroke="none" ifOverflow="hidden" />

                        <ReferenceLine x={returnStats.medianRisk} stroke={tc.referenceLine} strokeDasharray="6 4" />
                        <ReferenceLine y={returnStats.medianReturn} stroke={tc.referenceLine} strokeDasharray="6 4" />

                        <XAxis
                            type="number" dataKey="x" name="Risk"
                            domain={[returnStats.xMin, returnStats.xMax]}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`}
                            allowDataOverflow
                        />
                        <YAxis
                            type="number" dataKey="y" name="Return"
                            domain={[returnStats.yMin, returnStats.yMax]}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`}
                            width={38}
                            allowDataOverflow
                        />
                        <ZAxis type="number" dataKey="weight" range={[40, 400]} />

                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ payload }) => {
                                if (!payload?.length) return null;
                                const d = payload[0].payload as ScatterDataPoint;
                                const quadrant = getQuadrant(d.x, d.y, returnStats.medianRisk, returnStats.medianReturn);
                                return (
                                    <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-xl text-xs font-mono">
                                        <p className="font-bold text-wallstreet-text text-sm mb-1.5">{d.ticker}</p>
                                        <p className="text-wallstreet-500">Risk: {d.x.toFixed(1)}%</p>
                                        <p className="text-wallstreet-500">Return: {d.y.toFixed(1)}%</p>
                                        <p className="text-wallstreet-500">Weight: {d.weight.toFixed(1)}%</p>
                                        <p className={`font-semibold mt-1.5 ${quadrant.color}`}>{quadrant.label}</p>
                                    </div>
                                );
                            }}
                        />

                        <Scatter data={data}>
                            {data.map((entry, idx) => {
                                const q = getQuadrant(entry.x, entry.y, returnStats.medianRisk, returnStats.medianReturn);
                                return <Cell key={idx} fill={q.fill} fillOpacity={0.8} stroke={q.fill} strokeWidth={1} strokeOpacity={0.3} />;
                            })}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            ) : (
                /* ── Weight vs Risk (fair share) ── */
                <ResponsiveContainer width="100%" height={380}>
                    <ComposedChart
                        data={fairShareLine}
                        margin={{ left: 0, right: 10, top: 10, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} />

                        <XAxis
                            type="number" dataKey="x" name="Risk"
                            domain={[weightStats.xMin, weightStats.xMax]}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`}
                            allowDataOverflow
                        />
                        <YAxis
                            type="number" dataKey="weight" name="Weight"
                            domain={[weightStats.yMin, weightStats.yMax]}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`}
                            width={38}
                            allowDataOverflow
                        />
                        <ZAxis type="number" dataKey="weight" range={[40, 400]} />

                        {/* Fair share diagonal */}
                        <Line
                            data={fairShareLine}
                            dataKey="weight"
                            stroke={tc.referenceLine}
                            strokeDasharray="6 4"
                            dot={false}
                            isAnimationActive={false}
                            legendType="none"
                            tooltipType="none"
                        />

                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ payload }) => {
                                if (!payload?.length) return null;
                                const raw = payload[0]?.payload;
                                if (!raw?.ticker) return null;
                                const d = raw as ScatterDataPoint;
                                const ratio = d.weight > 0 ? d.x / d.weight : 0;
                                const isOverRisk = ratio > 1;
                                return (
                                    <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-xl text-xs font-mono">
                                        <p className="font-bold text-wallstreet-text text-sm mb-1.5">{d.ticker}</p>
                                        <p className="text-wallstreet-500">Risk: {d.x.toFixed(1)}%</p>
                                        <p className="text-wallstreet-500">Weight: {d.weight.toFixed(1)}%</p>
                                        <p className="text-wallstreet-500">Risk / Weight: {ratio.toFixed(2)}x</p>
                                        <p className={`font-semibold mt-1.5 ${isOverRisk ? 'text-red-500' : 'text-green-500'}`}>
                                            {isOverRisk ? 'Disproportionate Risk' : 'Efficient Allocation'}
                                        </p>
                                    </div>
                                );
                            }}
                        />

                        <Scatter data={data} dataKey="weight">
                            {data.map((entry, idx) => {
                                const ratio = entry.weight > 0 ? entry.x / entry.weight : 0;
                                return (
                                    <Cell
                                        key={idx}
                                        fill={ratio > 1 ? '#ef4444' : '#22c55e'}
                                        fillOpacity={0.8}
                                        stroke={ratio > 1 ? '#ef4444' : '#22c55e'}
                                        strokeWidth={1}
                                        strokeOpacity={0.3}
                                    />
                                );
                            })}
                        </Scatter>
                    </ComposedChart>
                </ResponsiveContainer>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2">
                {mode === 'return' ? (
                    QUADRANTS.map(q => (
                        <div key={q.label} className="flex items-center gap-1.5 text-[10px] font-mono text-wallstreet-500">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.fill }} />
                            {q.label}
                        </div>
                    ))
                ) : (
                    <>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-wallstreet-500">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                            Risk {'>'} Weight
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-wallstreet-500">
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                            Risk {'<'} Weight
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const QUADRANTS = [
    { label: 'Efficient', fill: '#22c55e', color: 'text-green-500' },
    { label: 'High Cost', fill: '#f59e0b', color: 'text-amber-500' },
    { label: 'Deadweight', fill: '#94a3b8', color: 'text-slate-400' },
    { label: 'Drag', fill: '#ef4444', color: 'text-red-500' },
];

function getQuadrant(x: number, y: number, medX: number, medY: number) {
    if (x <= medX && y >= medY) return QUADRANTS[0]; // Efficient
    if (x > medX && y >= medY) return QUADRANTS[1];  // High Cost
    if (x <= medX && y < medY) return QUADRANTS[2];   // Deadweight
    return QUADRANTS[3]; // Drag
}

const ChartSkeleton = () => (
    <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
        <div className="h-4 w-36 bg-wallstreet-700 rounded animate-pulse mb-4" />
        <div className="h-[350px] flex items-center justify-center">
            <div className="w-48 h-48 rounded-full border-2 border-wallstreet-700 animate-pulse" />
        </div>
    </div>
);
