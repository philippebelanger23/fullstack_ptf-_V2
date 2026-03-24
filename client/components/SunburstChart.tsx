import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

interface SunburstChartProps {
    data: {
        inner: { name: string; value: number; color: string }[];
        outer: { name: string; value: number; color: string }[];
    };
    width?: number | `${number}%`;
    height?: number | `${number}%`;
}

const RADIAN = Math.PI / 180;

const renderInnerLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, value }: any) => {
    // Only show label if slice is significant
    if (value < 5) return null;

    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <text
            x={x}
            y={y}
            fill="white"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold' }}
        >
            {name}
        </text>
    );
};

const renderOuterLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, value }: any) => {
    // Hide labels for small slices to avoid clutter
    if (value < 2.0) return null;

    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    // Calculate rotation angle in degrees
    // Recharts uses 0 degrees at 3 o'clock, proceeding counter-clockwise.
    // We want text to be readable (not upside down).
    let angle = -midAngle;
    if (angle < -90 && angle > -270) {
        angle += 180;
    }

    // For specific visual check: if text is too long, we might need to adjust or hide.
    // But basic rotation usually solves it for sunbursts.

    return (
        <g transform={`translate(${x},${y})`}>
            <text
                x={0}
                y={0}
                fill="white"
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${angle})`}
                style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}
            >
                {name}
            </text>
        </g>
    );
};

export const SunburstChart: React.FC<SunburstChartProps> = ({ data, width = "100%", height = "100%" }) => {
    return (
        <ResponsiveContainer width={width} height={height}>
            <PieChart>
                <Pie
                    data={data.inner}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={128}
                    stroke="#fff"
                    strokeWidth={2}
                    labelLine={false}
                    label={renderInnerLabel}
                    animationDuration={800}
                >
                    {data.inner.map((entry, index) => (
                        <Cell key={`cell-inner-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Pie
                    data={data.outer}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={130}
                    outerRadius={210}
                    stroke="#fff"
                    strokeWidth={2}
                    labelLine={false}
                    label={renderOuterLabel}
                    animationDuration={800}
                >
                    {data.outer.map((entry, index) => (
                        <Cell key={`cell-outer-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#000' }}
                    itemStyle={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}
                    formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                />
            </PieChart>
        </ResponsiveContainer>
    );
};
