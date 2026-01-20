import React from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';

interface CountryTreemapProps {
    data: { name: string; value: number }[];
    width?: number | string;
    height?: number | string;
}

const developedMarkets = [
    'United Kingdom', 'Japan', 'France', 'Switzerland', 'Germany', 'Australia', 'Netherlands',
    'Sweden', 'Denmark', 'Italy', 'Spain', 'Hong Kong', 'Singapore', 'Finland', 'Belgium',
    'Norway', 'Ireland', 'Israel', 'New Zealand', 'Austria', 'Portugal'
];

const emergingMarkets = [
    'China', 'Taiwan', 'India', 'Korea (South)', 'South Korea', 'Brazil', 'Saudi Arabia',
    'South Africa', 'Mexico', 'Thailand', 'Indonesia', 'Malaysia', 'Turkey', 'Philippines',
    'Poland', 'Chile', 'Greece', 'Peru', 'Hungary', 'Czech Republic', 'Egypt', 'Colombia'
];

const CustomizedContent = (props: any) => {
    const { x, y, width, height, index, name, value, depth } = props;

    // Ignore root node to avoid rendering background
    if (depth === 0 || name === 'root') return null;

    // Safety check for rendering
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
        return null;
    }

    // Color Logic
    let fill = '#94a3b8'; // Default: Slate 400 (Neutral Grey for others)

    if (name === 'United States') {
        fill = '#2563eb'; // Blue 600
    } else if (name === 'Canada') {
        fill = '#dc2626'; // Red 600
    } else if (emergingMarkets.includes(name)) {
        fill = '#d97706'; // Amber 600 (Distinct Warm Color for EM)
    } else if (developedMarkets.includes(name)) {
        fill = '#475569'; // Slate 600 (Darker Grey for DM)
    }

    // Gap and Radius logic
    const gap = 2; // Gap of 2px
    const radius = 0; // Square corners for cleaner grid look, or keep small radius? 
    // Screenshot 2 has sharp corners (or very very small). Let's stick to 2px gap but maybe sharp corners or minimal radius.
    // The previous code had radius 6. Let's try radius 0 to match the "clean grid" look of Screenshot 2.

    // Adjusted dimensions for gap
    const adjX = x + gap;
    const adjY = y + gap;
    const adjW = width - (gap * 2);
    const adjH = height - (gap * 2);

    // Don't render if too small
    if (adjW <= 0 || adjH <= 0) return null;

    // --- SMART LABEL LOGIC ---
    let displayName = name;

    // Aggressive aliases for smaller boxes
    if (adjW < 120 || adjH < 50) {
        const aliases: Record<string, string> = {
            'United Kingdom': 'UK',
            'United States': 'USA',
            'Korea (South)': 'S. Korea',
            'Switzerland': 'Switz',
            'Australia': 'Aus',
            'Netherlands': 'Neth.',
            'Germany': 'DE',
            'France': 'Fra',
            'Taiwan': 'Tai',
            'Japan': 'Jap',
            'China': 'Chi'
        };
        if (aliases[name]) displayName = aliases[name];
    }

    // Hide text if box is excessively small - slightly more permissive now
    const showText = adjW > 24 && adjH > 24;

    // Font Sizing Calculation
    // Base it primarily on width, but clamp it reasonable.
    // We want the text to be legible but not massive.

    // Max font size for large boxes (like US)
    const maxFontSize = 14;
    // Min font size for small boxes
    const minFontSize = 10;

    // Calculate ideal size based on width
    // 10px per char is roughly 14px font. 
    // Let's ensure the name fits in 90% of width.
    const charCount = displayName.length;
    let computedFontSize = (adjW * 0.9) / (charCount * 0.7); // 0.7 aspect ratio approx

    // Clamp
    let fontSize = Math.min(Math.max(computedFontSize, minFontSize), maxFontSize);

    // For very large boxes (US/Canada), we might want slightly larger text but not huge.
    if (adjW > 200 && adjH > 100) {
        fontSize = 16;
    }

    // Padding for bottom-left alignment
    const paddingX = 6;
    const paddingY = 6;

    return (
        <g>
            <rect
                x={adjX}
                y={adjY}
                width={adjW}
                height={adjH}
                // rx={radius}
                // ry={radius}
                fill={fill}
                style={{
                    stroke: '#fff',
                    strokeWidth: 0,
                    // No shadow for flat clean look
                    cursor: 'pointer'
                }}
            />
            {showText && (
                <text
                    x={adjX + paddingX}
                    y={adjY + adjH - paddingY}
                    textAnchor="start"
                    // dominantBaseline="auto" // Default is baseline, which is what we want for bottom alignment
                    fill="#fff"
                    style={{ pointerEvents: 'none', textShadow: '0px 1px 2px rgba(0,0,0,0.4)' }}
                >
                    <tspan
                        x={adjX + paddingX}
                        dy="-1.3em" // Move up for the NAME (it's above the percentage)
                        style={{
                            fontSize: `${fontSize}px`,
                            fontWeight: 500, // Medium (not bold)
                            fontFamily: '"JetBrains Mono", monospace'
                            // letterSpacing removed (mono usually fine)
                        }}
                    >
                        {displayName}
                    </tspan>
                    <tspan
                        x={adjX + paddingX}
                        dy="1.5em" // Move down for the VALUE (Back to bottom)
                        style={{
                            fontSize: `${fontSize * 0.9}px`, // Slightly smaller than name
                            fontWeight: 400, // Regular
                            fontFamily: '"JetBrains Mono", monospace'
                            // letterSpacing removed
                        }}
                    >
                        {value.toFixed(2)}%
                    </tspan>
                </text>
            )
            }
        </g >
    );
};

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white/95 backdrop-blur-sm p-3 border border-slate-200 rounded-lg shadow-lg">
                <p className="text-slate-800 font-bold text-sm mb-1">{data.name}</p>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500 text-xs text-nowrap">Weight</span>
                    <span className={`font-mono font-bold text-sm ${data.name === 'United States' ? 'text-blue-600' :
                        data.name === 'Canada' ? 'text-red-600' :
                            emergingMarkets.includes(data.name) ? 'text-amber-600' :
                                'text-slate-600'
                        }`}>
                        {data.value.toFixed(2)}%
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

export const CountryTreemap: React.FC<CountryTreemapProps> = ({ data, width = "100%", height = "100%" }) => {
    return (
        <ResponsiveContainer width={width} height={height}>
            <Treemap
                data={data}
                dataKey="value"
                aspectRatio={2}
                stroke="#fff"
                fill="#8884d8"
                content={<CustomizedContent />}
                animationDuration={800}
                animationEasing="ease-in-out"
                isAnimationActive={true}
            >
                <Tooltip content={<CustomTooltip />} cursor={false} />
            </Treemap>
        </ResponsiveContainer>
    );
};
