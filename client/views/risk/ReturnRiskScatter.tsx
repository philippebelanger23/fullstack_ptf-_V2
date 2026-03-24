import React, { useMemo } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, ReferenceLine, ReferenceArea, ZAxis,
} from 'recharts';
import { useThemeColors } from '../../hooks/useThemeColors';
import { ScatterDataPoint } from './riskUtils';

interface ReturnRiskScatterProps {
    data: ScatterDataPoint[];
    loading: boolean;
}

export const ReturnRiskScatter: React.FC<ReturnRiskScatterProps> = ({ data, loading }) => {
    const tc = useThemeColors();

    const { medianRisk, medianReturn, xMax, yMin, yMax } = useMemo(() => {
        if (data.length === 0) return { medianRisk: 0, medianReturn: 0, xMax: 10, yMin: -10, yMax: 10 };
        const sortedX = [...data].sort((a, b) => a.x - b.x);
        const sortedY = [...data].sort((a, b) => a.y - b.y);
        const mid = Math.floor(data.length / 2);
        const medianRisk = data.length % 2 ? sortedX[mid].x : (sortedX[mid - 1].x + sortedX[mid].x) / 2;
        const medianReturn = data.length % 2 ? sortedY[mid].y : (sortedY[mid - 1].y + sortedY[mid].y) / 2;

        const rawMaxX = Math.max(...data.map(d => d.x));
        const xMax = rawMaxX * 1.15;

        const rawMinY = Math.min(...data.map(d => d.y));
        const rawMaxY = Math.max(...data.map(d => d.y));
        const yPad = (rawMaxY - rawMinY) * 0.1 || 5;
        return {
            medianRisk, medianReturn, xMax,
            yMin: rawMinY - yPad,
            yMax: rawMaxY + yPad,
        };
    }, [data]);

    if (loading) return <ChartSkeleton />;

    return (
        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
            <div className="mb-4">
                <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Return vs Risk</h3>
                <p className="text-[11px] text-wallstreet-500 mt-0.5">Quadrant analysis — size = weight, crosshairs = median</p>
            </div>

            {data.length === 0 ? (
                <div className="h-[350px] flex items-center justify-center text-wallstreet-500 text-sm">No data</div>
            ) : (
                <ResponsiveContainer width="100%" height={380}>
                    <ScatterChart margin={{ left: 5, right: 25, top: 20, bottom: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStrokeLight} />

                        {/* Quadrant shading — very subtle tints, just enough to hint at zones */}
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={0} x2={medianRisk} y1={medianReturn} y2={yMax} fill="#22c55e" fillOpacity={0.03} stroke="none" />
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={medianRisk} x2={xMax} y1={medianReturn} y2={yMax} fill="#f59e0b" fillOpacity={0.03} stroke="none" />
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={0} x2={medianRisk} y1={yMin} y2={medianReturn} fill="#94a3b8" fillOpacity={0.02} stroke="none" />
                        {/* @ts-expect-error Recharts v3 ReferenceArea numeric props */}
                        <ReferenceArea x1={medianRisk} x2={xMax} y1={yMin} y2={medianReturn} fill="#ef4444" fillOpacity={0.03} stroke="none" />

                        {/* Crosshairs */}
                        <ReferenceLine x={medianRisk} stroke={tc.referenceLine} strokeDasharray="6 4" />
                        <ReferenceLine y={medianReturn} stroke={tc.referenceLine} strokeDasharray="6 4" />

                        <XAxis
                            type="number" dataKey="x" name="Risk"
                            domain={[0, xMax]}
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`}
                            label={{ value: 'Risk Contribution %', position: 'insideBottom', offset: -8, fontSize: 11, fill: tc.tickFill }}
                        />
                        <YAxis
                            type="number" dataKey="y" name="Return"
                            tick={{ fontSize: 11, fill: tc.tickFill }}
                            axisLine={false} tickLine={false}
                            tickFormatter={v => `${v.toFixed(0)}%`}
                            label={{ value: 'Annualized Return %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: tc.tickFill }}
                        />
                        <ZAxis type="number" dataKey="weight" range={[40, 400]} />

                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ payload }) => {
                                if (!payload?.length) return null;
                                const d = payload[0].payload as ScatterDataPoint;
                                const quadrant = getQuadrant(d.x, d.y, medianRisk, medianReturn);
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
                                const q = getQuadrant(entry.x, entry.y, medianRisk, medianReturn);
                                return <Cell key={idx} fill={q.fill} fillOpacity={0.8} stroke={q.fill} strokeWidth={1} strokeOpacity={0.3} />;
                            })}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            )}

            {/* Quadrant legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-2">
                {QUADRANTS.map(q => (
                    <div key={q.label} className="flex items-center gap-1.5 text-[10px] font-mono text-wallstreet-500">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: q.fill }} />
                        {q.label}
                    </div>
                ))}
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
