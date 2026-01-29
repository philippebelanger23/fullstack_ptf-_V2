import React, { memo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

interface Props {
    data: { name: string; value: number }[];
    colors: string[];
}

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value, colors }: any) => {
    const RADIAN = Math.PI / 180;
    // Radius for label placement
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + (outerRadius + 30) * Math.cos(-midAngle * RADIAN);
    const y = cy + (outerRadius + 30) * Math.sin(-midAngle * RADIAN);
    const textAnchor = x > cx ? 'start' : 'end';

    return (
        <text x={x} y={y} fill={colors[index % colors.length]} textAnchor={textAnchor} dominantBaseline="central" className="font-mono text-xs font-bold">
            {`${name}`}
            <tspan x={x} y={y + 14} fill="#64748b" className="font-normal">{`${value.toFixed(2)}%`}</tspan>
        </text>
    );
};

export const ConcentrationPieChart = memo(({ data, colors }: Props) => {
    return (
        <div className="lg:col-span-4 bg-white p-6 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col min-h-[450px]">
            <div className="mb-4">
                <h3 className="font-mono font-bold text-wallstreet-text uppercase tracking-wider text-sm flex items-center gap-2">
                    <PieChartIcon size={16} className="text-wallstreet-500" /> Actual Top 10
                </h3>
            </div>
            <div className="flex-1 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={150}
                            outerRadius={210}
                            fill="#8884d8"
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                            label={(props) => renderCustomizedLabel({ ...props, colors })}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
});

ConcentrationPieChart.displayName = 'ConcentrationPieChart';
