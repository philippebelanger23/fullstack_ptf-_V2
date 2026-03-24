import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { RiskPosition } from '../../types';
import { useThemeColors } from '../../hooks/useThemeColors';
import { riskAdjReturnColor } from './riskUtils';

interface RiskTreemapProps {
    positions: RiskPosition[];
    loading: boolean;
    sectorCount?: number;
}

interface TreemapNode {
    name: string;
    size: number;
    riskPct: number;
    weight: number;
    riskAdjReturn: number;
    annualizedReturn: number;
    individualVol: number;
    beta: number;
}

const CustomContent: React.FC<any> = (props) => {
    const { x, y, width, height, name, riskPct, riskAdjReturn, isDark } = props;
    if (width < 30 || height < 25) return null;

    const fill = riskAdjReturnColor(riskAdjReturn, isDark);
    const textColor = Math.abs(riskAdjReturn) > 0.5 ? '#fff' : (isDark ? '#e2e8f0' : '#1e293b');

    return (
        <g>
            <rect
                x={x} y={y} width={width} height={height}
                rx={6}
                fill={fill}
                stroke={isDark ? 'rgba(15,23,42,0.6)' : 'rgba(255,255,255,0.8)'}
                strokeWidth={2}
            />
            {width > 50 && height > 35 && (
                <>
                    <text
                        x={x + width / 2} y={y + height / 2 - 6}
                        textAnchor="middle" fill={textColor}
                        fontSize={width > 80 ? 12 : 10} fontFamily="JetBrains Mono, monospace" fontWeight="bold"
                    >
                        {name?.replace('.TO', '')}
                    </text>
                    <text
                        x={x + width / 2} y={y + height / 2 + 10}
                        textAnchor="middle" fill={textColor}
                        fontSize={10} fontFamily="JetBrains Mono, monospace" opacity={0.8}
                    >
                        {riskPct?.toFixed(1)}%
                    </text>
                </>
            )}
            {width > 30 && width <= 50 && height > 25 && (
                <text
                    x={x + width / 2} y={y + height / 2 + 3}
                    textAnchor="middle" fill={textColor}
                    fontSize={9} fontFamily="JetBrains Mono, monospace" fontWeight="bold"
                >
                    {name?.replace('.TO', '').slice(0, 5)}
                </text>
            )}
        </g>
    );
};

const TreemapTooltip: React.FC<{ active?: boolean; payload?: any[] }> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload as TreemapNode;
    return (
        <div className="bg-wallstreet-800 border border-wallstreet-700 rounded-lg p-3 shadow-xl text-xs font-mono min-w-[190px]">
            <div className="font-bold text-wallstreet-text text-sm border-b border-wallstreet-700 pb-2 mb-2">{d.name}</div>
            <div className="space-y-1.5">
                <div className="flex justify-between gap-4">
                    <span className="text-wallstreet-500">Risk %</span>
                    <span className="font-bold text-red-500">{d.riskPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-wallstreet-500">Weight</span>
                    <span className="font-bold text-blue-500">{d.weight.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-wallstreet-500">Return</span>
                    <span className={`font-bold ${d.annualizedReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>{d.annualizedReturn.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-wallstreet-500">Risk-Adj Ret</span>
                    <span className={`font-bold ${d.riskAdjReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>{d.riskAdjReturn.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-wallstreet-500">Beta</span>
                    <span className="font-bold text-wallstreet-text">{d.beta.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};

export const RiskTreemap: React.FC<RiskTreemapProps> = ({ positions, loading, sectorCount = 11 }) => {
    const tc = useThemeColors();

    if (loading) return <TreemapSkeleton />;

    const treemapData = positions
        .filter(p => p.pctOfTotalRisk > 0)
        .map(p => ({
            name: p.ticker,
            size: Math.max(p.pctOfTotalRisk, 0.5),
            riskPct: p.pctOfTotalRisk,
            weight: p.weight,
            riskAdjReturn: p.riskAdjustedReturn,
            annualizedReturn: p.annualizedReturn,
            individualVol: p.individualVol,
            beta: p.beta,
        }))
        .sort((a, b) => a.riskAdjReturn - b.riskAdjReturn); // Sort by risk-adjusted return (negative to positive)

    // Match height to sector chart: Math.max(320, sectorCount * 35)
    const chartHeight = Math.max(320, sectorCount * 35);

    return (
        <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6 h-full flex flex-col">
            <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-bold text-wallstreet-text uppercase tracking-wider">Risk Treemap</h3>
                    <p className="text-[11px] text-wallstreet-500 mt-0.5">Size = risk contribution, color = risk-adjusted return</p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-mono font-bold text-red-500">Negative</span>
                    <div className="h-3.5 w-36 rounded-full overflow-hidden flex">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex-1 h-full"
                                style={{ backgroundColor: riskAdjReturnColor((i / 11) * 4 - 2, tc.isDark) }}
                            />
                        ))}
                    </div>
                    <span className="text-xs font-mono font-bold text-green-500">Positive</span>
                    <span className="text-xs font-mono text-wallstreet-500">(risk-adj return)</span>
                </div>
            </div>

            {treemapData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-wallstreet-500 text-sm">No data</div>
            ) : (
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                            data={treemapData}
                            dataKey="size"
                            aspectRatio={4 / 3}
                            content={<CustomContent isDark={tc.isDark} />}
                        >
                            <Tooltip content={<TreemapTooltip />} />
                        </Treemap>
                    </ResponsiveContainer>
                </div>
            )}

        </div>
    );
};

const TreemapSkeleton = () => (
    <div className="bg-wallstreet-800 rounded-2xl border border-wallstreet-700 shadow-sm p-6">
        <div className="h-4 w-32 bg-wallstreet-700 rounded animate-pulse mb-4" />
        <div className="h-[240px] grid grid-cols-4 grid-rows-3 gap-1">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bg-wallstreet-700 rounded animate-pulse" />
            ))}
        </div>
    </div>
);
