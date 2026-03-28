import React from 'react';
import {
    ComposedChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Scatter,
    Rectangle
} from 'recharts';
import { useThemeColors } from '../hooks/useThemeColors';

interface DotPlotProps {
    data: any[];
}

export const ClevelandDotPlot: React.FC<DotPlotProps> = ({ data }) => {
    const tc = useThemeColors();
    // Map of raw sector names to user-preferred display names
    const sectorMap: Record<string, string> = {
        "Information Technology": "Technology",
        "Consumer Discretionary": "Discretionary",
        "Consumer Staples": "Staples",
        "Communication": "Communications",
        "Communication Services": "Communications",
    };

    // Transform data: Map names, filter Cash, calculate range
    const chartData = data
        .filter(item => !item.sector.includes("Cash")) // Drop Cash/Derivatives
        .map(item => ({
            ...item,
            // Use mapped name if exists, else match raw name (handle slight variations if needed)
            displaySector: sectorMap[item.sector] || item.sector,
            range: [Math.min(item.ACWI, item.TSX), Math.max(item.ACWI, item.TSX)]
        }));

    // Sort by specific order requested by user
    const sortOrder = [
        "Materials",
        "Discretionary",
        "Financials",
        "Real Estate",
        "Communications",
        "Energy",
        "Industrials",
        "Technology",
        "Staples",
        "Health Care",
        "Utilities"
    ];

    const sortedData = [...chartData].sort((a, b) => {
        const indexA = sortOrder.indexOf(a.displaySector);
        const indexB = sortOrder.indexOf(b.displaySector);

        // Handle items not in the list (put them at the end)
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;

        return indexA - indexB;
    });

    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
                layout="vertical"
                data={sortedData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }} // Minimal margins
            >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke={tc.gridStrokeLight} strokeOpacity={0.4} />
                <XAxis type="number" domain={[0, 'auto']} unit="%" tick={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fill: tc.tickFill }} />
                <YAxis
                    type="category"
                    dataKey="displaySector"
                    width={110}
                    tickLine={false}
                    tick={(props) => {
                        const { x, y, payload } = props;
                        return (
                            <text
                                x={x - 100}
                                y={y}
                                fill={tc.tickFill}
                                fontSize={12}
                                fontFamily="'JetBrains Mono', monospace"
                                fontWeight="bold"
                                textAnchor="start"
                                dominantBaseline="middle"
                            >
                                {payload.value}
                            </text>
                        );
                    }}
                />
                <Tooltip
                    cursor={{ fill: tc.isDark ? 'rgba(51,65,85,0.3)' : '#f8fafc', opacity: 0.5 }}
                    content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const HIDDEN = new Set(['displaySector', 'range', 'sector']);
                        const items = payload.filter(p => !HIDDEN.has(p.dataKey as string) && !Array.isArray(p.value));
                        if (!items.length) return null;
                        return (
                            <div style={{ backgroundColor: tc.tooltipBgSolid, border: `1px solid ${tc.tooltipBorder}`, borderRadius: 8, padding: '8px 12px' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: tc.tooltipText }}>{label}</div>
                                {items.map(item => (
                                    <div key={item.dataKey as string} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 'bold', color: item.color, marginBottom: 2 }}>
                                        {item.name} : {Number(item.value).toFixed(2)}%
                                    </div>
                                ))}
                            </div>
                        );
                    }}
                />
                <Legend
                    verticalAlign="top"
                    align="right"
                    height={30}
                    iconSize={10}
                    wrapperStyle={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", top: -5 }}
                />

                {/* Connector Line (The Bar) */}
                {/* We use a Bar with a custom shape or just standard if range is supported properly in this version.
                    Recharts standard Bar with [min, max] works.
                    We make it visually subtle (gray or theme color)
                */}
                <Bar
                    dataKey="range"
                    fill="#cbd5e1" // Slate-300
                    barSize={2} // Very thin to look like a line
                    legendType="none" // Hide from legend
                    isAnimationActive={false}
                    radius={[2, 2, 2, 2]} // Rounded ends
                />

                {/* ACWI Dot */}
                <Scatter name="ACWI (75%)" dataKey="ACWI" fill="#2563eb" shape="circle" />

                {/* TSX Dot */}
                <Scatter name="XIC.TO (25%)" dataKey="TSX" fill="#dc2626" shape="circle" />

                {/* Index Triangle */}
                <Scatter name="75/25 Composite" dataKey="Index" fill="#10b981" shape="triangle" />

            </ComposedChart>
        </ResponsiveContainer>
    );
};
