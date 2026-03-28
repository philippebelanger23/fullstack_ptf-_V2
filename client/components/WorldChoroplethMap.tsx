import React, { useState, useMemo, useCallback } from 'react';
import { Map as MapIcon, Table2 } from 'lucide-react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleLog } from 'd3-scale';
import { backendToTopoName, topoToBackendName, getMarketType } from '../utils/countryCodeMap';

const GEO_URL = '/data/world-110m.json';

interface GeoEntry {
    region: string;
    weight: number;
    ACWI: number;
    TSX: number;
}

interface WorldChoroplethMapProps {
    data: GeoEntry[];
}

type ViewMode = 'Index' | 'ACWI' | 'TSX';

const MARKET_LABELS: Record<string, string> = {
    US: 'United States',
    Canada: 'Canada',
    DM: 'Developed Market',
    EM: 'Emerging Market',
    Other: 'Other',
};

// Color interpolators
function interpolateBlue(t: number): string {
    // slate-100 → blue-500 → dark navy
    const r = Math.round(241 - t * 211);
    const g = Math.round(245 - t * 187);
    const b = Math.round(249 - t * 159);
    return `rgb(${Math.max(0, r)},${Math.max(0, g)},${Math.max(0, b)})`;
}

function interpolateRed(t: number): string {
    // rose-50 → red-600 → red-900
    const r = Math.round(254 - t * 127);
    const g = Math.round(242 - t * 213);
    const b = Math.round(242 - t * 213);
    return `rgb(${Math.max(0, r)},${Math.max(0, g)},${Math.max(0, b)})`;
}

const NO_DATA_COLOR = '#e2e8f0'; // slate-200
const HOVER_STROKE = '#1e3a5a';

export const WorldChoroplethMap: React.FC<WorldChoroplethMapProps> = ({ data }) => {
    const [displayMode, setDisplayMode] = useState<'map' | 'table'>('map');
    const [view, setView] = useState<ViewMode>('Index');
    const [hoveredGeo, setHoveredGeo] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [tooltipData, setTooltipData] = useState<GeoEntry | null>(null);
    const [tooltipMapName, setTooltipMapName] = useState('');

    // Build lookup: TopoJSON name → backend entry
    const dataByTopoName = useMemo(() => {
        const map = new Map<string, GeoEntry>();
        for (const entry of data) {
            const topoName = backendToTopoName[entry.region] || entry.region;
            map.set(topoName, entry);
        }
        return map;
    }, [data]);

    // Get weight for current view
    const getWeight = useCallback((entry: GeoEntry | undefined): number => {
        if (!entry) return 0;
        if (view === 'ACWI') return entry.ACWI;
        if (view === 'TSX') return entry.TSX;
        return entry.weight; // 'Index'
    }, [view]);

    // Color scale — log scale so US/Canada saturate at full dark while
    // smaller countries (1–5%) get genuine mid-range colors, not near-gray.
    // LOG_MIN is the effective floor: any allocation > 0 is clamped up to it,
    // ensuring even tiny holdings are visibly distinct from no-data countries.
    const colorScale = useMemo(() => {
        const weights = data.map(d => getWeight(d)).filter(w => w > 0);
        if (!weights.length) return (weight: number) => NO_DATA_COLOR;
        const maxW = Math.max(...weights);
        const LOG_MIN = 0.05; // % floor — keeps log() defined and tiny allocations colored

        const scale = scaleLog()
            .domain([LOG_MIN, maxW])
            .range([0.18, 1] as any) // t=0.18 → light-but-clear blue; t=1 → full dark navy
            .clamp(true);

        return (weight: number) => {
            if (weight <= 0) return NO_DATA_COLOR;
            const t = scale(Math.max(weight, LOG_MIN)) as unknown as number;
            return view === 'TSX' ? interpolateRed(t) : interpolateBlue(t);
        };
    }, [data, view, getWeight]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        });
    }, []);

    const handleGeoEnter = useCallback((geoName: string) => {
        setHoveredGeo(geoName);
        const entry = dataByTopoName.get(geoName);
        if (entry) {
            setTooltipData(entry);
            setTooltipMapName(geoName);
        } else {
            setTooltipData(null);
            setTooltipMapName(geoName);
        }
    }, [dataByTopoName]);

    const handleGeoLeave = useCallback(() => {
        setHoveredGeo(null);
        setTooltipData(null);
        setTooltipMapName('');
    }, []);

    const views: ViewMode[] = ['Index', 'ACWI', 'TSX'];

    // Table data: all countries sorted by composite weight
    const tableRows = useMemo(() => {
        return [...data].sort((a, b) => b.weight - a.weight);
    }, [data]);

    const MARKET_BADGE: Record<string, string> = {
        US: 'bg-blue-100 text-blue-700',
        Canada: 'bg-red-100 text-red-700',
        DM: 'bg-wallstreet-900 text-wallstreet-500',
        EM: 'bg-amber-100 text-amber-700',
        Other: 'bg-gray-100 text-gray-500',
    };

    return (
        <div className="flex flex-col h-full w-full" onMouseMove={handleMouseMove}>
            {/* Header row: Map/Table toggle left, ETF toggle right */}
            <div className="flex items-center justify-between mb-3">
                {/* Map / Table toggle */}
                <div className="flex items-center bg-wallstreet-50 rounded-lg p-0.5 gap-0.5">
                    <button
                        onClick={() => setDisplayMode('map')}
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-md transition-all ${displayMode === 'map'
                            ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                            : 'text-wallstreet-400 hover:text-wallstreet-600'
                            }`}
                    >
                        <MapIcon size={12} />
                        Map
                    </button>
                    <button
                        onClick={() => setDisplayMode('table')}
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-mono rounded-md transition-all ${displayMode === 'table'
                            ? 'bg-wallstreet-800 text-wallstreet-text shadow-sm'
                            : 'text-wallstreet-400 hover:text-wallstreet-600'
                            }`}
                    >
                        <Table2 size={12} />
                        Table
                    </button>
                </div>

                {/* ETF view toggle (map only) */}
                {displayMode === 'map' && (
                    <div className="flex items-center gap-1">
                        {views.map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-3 py-1 text-xs font-mono rounded-md transition-all ${view === v
                                    ? 'bg-wallstreet-accent text-white shadow-sm'
                                    : 'bg-wallstreet-50 text-wallstreet-500 hover:bg-wallstreet-100'
                                    }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Table view */}
            {displayMode === 'table' && (
                <div className="flex-1 overflow-y-auto min-h-0">
                    <table className="w-full text-sm font-mono table-fixed">
                        <thead className="sticky top-0 bg-wallstreet-50 text-wallstreet-500 text-xs uppercase">
                            <tr>
                                <th className="p-2 text-left w-[34%]">Country</th>
                                <th className="p-2 text-left w-[16%]">Type</th>
                                <th className="p-2 text-right w-[12%]">75/25</th>
                                <th className="p-2 text-right w-[13%]">ACWI</th>
                                <th className="p-2 text-right w-[13%]">XIC.TO</th>
                                <th className="p-2 text-right w-[12%]">Cumul.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let cumul = 0;
                                return tableRows.map((row) => {
                                    cumul += row.weight;
                                    const marketType = getMarketType(row.region);
                                    return (
                                        <tr key={row.region} className="border-b border-wallstreet-100 hover:bg-wallstreet-50">
                                            <td className="py-1.5 px-2 text-wallstreet-text font-medium truncate text-sm">{row.region}</td>
                                            <td className="py-1.5 px-2">
                                                <span className={`text-sm px-1.5 py-0.5 rounded font-mono ${MARKET_BADGE[marketType]}`}>
                                                    {marketType === 'US' ? 'US' : marketType === 'Canada' ? 'CA' : marketType}
                                                </span>
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-bold text-wallstreet-text text-sm">{row.weight.toFixed(1)}%</td>
                                            <td className="py-1.5 px-2 text-right text-wallstreet-500 text-sm">{row.ACWI > 0 ? `${row.ACWI.toFixed(1)}%` : '—'}</td>
                                            <td className="py-1.5 px-2 text-right text-wallstreet-500 text-sm">{row.TSX > 0 ? `${row.TSX.toFixed(1)}%` : '—'}</td>
                                            <td className="py-1.5 px-2 text-right text-wallstreet-400 text-sm">{cumul.toFixed(1)}%</td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Map — always mounted (keeps the Geographies fetched), hidden in table mode */}
            <div className={displayMode === 'map' ? 'flex-1 relative min-h-0' : 'hidden'}>
                <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{
                        scale: 130,
                        center: [0, 50],
                    }}
                    style={{ width: '100%', height: '100%' }}
                >
                    <Geographies geography={GEO_URL}>
                        {({ geographies }: { geographies: any[] }) =>
                            geographies.map((geo) => {
                                const geoName = geo.properties.name;
                                const entry = dataByTopoName.get(geoName);
                                const weight = getWeight(entry);
                                const isHovered = hoveredGeo === geoName;

                                return (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        onMouseEnter={() => handleGeoEnter(geoName)}
                                        onMouseLeave={handleGeoLeave}
                                        style={{
                                            default: {
                                                fill: colorScale(weight),
                                                stroke: '#fff',
                                                strokeWidth: 0.5,
                                                outline: 'none',
                                                transition: 'fill 300ms ease',
                                            },
                                            hover: {
                                                fill: colorScale(weight),
                                                stroke: HOVER_STROKE,
                                                strokeWidth: 1.5,
                                                outline: 'none',
                                                cursor: 'pointer',
                                            },
                                            pressed: {
                                                fill: colorScale(weight),
                                                outline: 'none',
                                            },
                                        }}
                                    />
                                );
                            })
                        }
                    </Geographies>
                </ComposableMap>

                {/* Tooltip */}
                {hoveredGeo && tooltipMapName && (
                    <div
                        className="absolute pointer-events-none z-50 bg-wallstreet-800 p-3 border border-wallstreet-700 rounded-lg shadow-lg font-mono text-sm"
                        style={{
                            left: Math.min(tooltipPos.x + 12, (typeof window !== 'undefined' ? 400 : 400)),
                            top: tooltipPos.y - 10,
                            maxWidth: 220,
                        }}
                    >
                        <p className="font-bold text-wallstreet-text mb-1.5">
                            {tooltipData?.region || tooltipMapName}
                        </p>
                        {tooltipData ? (
                            <>
                                <div className="border-t border-wallstreet-700 pt-1.5 space-y-0.5">
                                    <div className="flex justify-between gap-4">
                                        <span className="text-wallstreet-500 text-xs">Index</span>
                                        <span className="font-bold text-blue-700">{tooltipData.weight.toFixed(2)}%</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-wallstreet-500 text-xs">ACWI (75%)</span>
                                        <span className="text-wallstreet-text">{tooltipData.ACWI.toFixed(2)}%</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-wallstreet-500 text-xs">XIC.TO (25%)</span>
                                        <span className="text-wallstreet-text">{tooltipData.TSX.toFixed(2)}%</span>
                                    </div>
                                </div>
                                <div className="border-t border-wallstreet-700 mt-1.5 pt-1.5">
                                    <span className="text-xs text-wallstreet-500">
                                        {MARKET_LABELS[getMarketType(tooltipData.region)] || 'Other'}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-wallstreet-500">Not in index</p>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
};
