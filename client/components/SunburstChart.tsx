import React, { useState } from 'react';

export interface SunburstChild { name: string; value: number; color: string; }
export interface SunburstSegment { name: string; value: number; color: string; children: SunburstChild[]; }

interface Props {
    segments: SunburstSegment[];
    centerLabel?: string;
    width?: number | string;
    height?: number | string;
}

interface Tip { x: number; y: number; name: string; value: number; }

// Layout constants
const W = 500, CX = 250, CY = 250;
const R0 = 82;   // center hole
const R1 = 168;  // inner ring outer edge
const R2 = 175;  // outer ring inner edge
const R3 = 242;  // outer ring outer edge
const IG = 1.5;  // inner gap degrees
const OG = 0.5;  // outer gap degrees

function pt(r: number, deg: number): [number, number] {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

function sector(r1: number, r2: number, a1: number, a2: number): string {
    if (a2 - a1 >= 360) a2 = a1 + 359.99;
    const [ax, ay] = pt(r2, a1), [bx, by] = pt(r2, a2);
    const [cx2, cy2] = pt(r1, a2), [dx, dy] = pt(r1, a1);
    const lg = a2 - a1 > 180 ? 1 : 0;
    return `M${ax},${ay}A${r2},${r2},0,${lg},1,${bx},${by}L${cx2},${cy2}A${r1},${r1},0,${lg},0,${dx},${dy}Z`;
}

// Arc path for textPath — reverses in bottom half so text is never upside-down
function textArcPath(r: number, a1: number, a2: number): string {
    const mid = (a1 + a2) / 2;
    const bottom = mid > 90 && mid < 270;
    const [sx, sy] = pt(r, bottom ? a2 : a1);
    const [ex, ey] = pt(r, bottom ? a1 : a2);
    const lg = a2 - a1 > 180 ? 1 : 0;
    return `M${sx},${sy}A${r},${r},0,${lg},${bottom ? 0 : 1},${ex},${ey}`;
}

// Rotation to keep radial text readable
function radialRot(deg: number): number {
    let r = deg - 90;
    if (r > 90 && r < 270) r += 180;
    return r;
}

export const SunburstChart: React.FC<Props> = ({ segments, centerLabel, width = '100%', height = '100%' }) => {
    const [tip, setTip] = useState<Tip | null>(null);

    const total = segments.reduce((s, g) => s + g.value, 0);

    type ISlice = SunburstSegment & { a1: number; a2: number };
    type OSlice = SunburstChild & { a1: number; a2: number };

    const iSlices: ISlice[] = [];
    const oSlices: OSlice[] = [];
    const rmid = (R0 + R1) / 2;
    const pctR = R0 + (R1 - R0) * 0.32; // radius for % labels (close to inner edge)

    let ic = 0;
    const iu = 360 - segments.length * IG;

    segments.forEach((seg, si) => {
        const span = (seg.value / total) * iu;
        const a1 = ic + (si > 0 ? IG : 0);
        const a2 = a1 + span;
        ic = a2;
        iSlices.push({ ...seg, a1, a2 });

        const ct = seg.children.reduce((s, c) => s + c.value, 0);
        if (ct === 0) return;
        const ou = (a2 - a1) - seg.children.length * OG;
        let oc = a1;
        seg.children.forEach((child, ci) => {
            const cs = (child.value / ct) * ou;
            const ca1 = oc + (ci > 0 ? OG : 0);
            const ca2 = ca1 + cs;
            oc = ca2;
            oSlices.push({ ...child, a1: ca1, a2: ca2 });
        });
    });

    const onEnter = (e: React.MouseEvent<SVGPathElement>, name: string, value: number) => {
        const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
        const rect = svg.getBoundingClientRect();
        setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, name, value });
    };

    return (
        <div style={{ width, height, position: 'relative' }} onMouseLeave={() => setTip(null)}>
            <svg viewBox={`0 0 ${W} ${W}`} width="100%" height="100%">
                <defs>
                    {iSlices.map((seg, i) => (
                        <path key={`ta${i}`} id={`ia-${i}`} d={textArcPath(rmid, seg.a1, seg.a2)} fill="none" />
                    ))}
                </defs>

                {/* ── Outer ring: countries ── */}
                {oSlices.map((c, i) => {
                    const span = c.a2 - c.a1;
                    const mid = (c.a1 + c.a2) / 2;
                    const [lx, ly] = pt((R2 + R3) / 2, mid);
                    const rot = radialRot(mid);
                    const label = span > 14
                        ? (c.name.length > 15 ? c.name.split(' ').map(w => w[0]).join('') : c.name)
                        : span > 8 ? c.name.split(' ')[0] : '';

                    return (
                        <g key={`o${i}`}>
                            <path
                                d={sector(R2, R3, c.a1, c.a2)}
                                fill={c.color}
                                stroke="#0f172a"
                                strokeWidth={0.7}
                                onMouseEnter={e => onEnter(e, c.name, c.value)}
                                onMouseLeave={() => setTip(null)}
                                style={{ cursor: 'pointer' }}
                                onMouseOver={e => (e.currentTarget.style.filter = 'brightness(1.15)')}
                                onMouseOut={e => (e.currentTarget.style.filter = '')}
                            />
                            {label && (
                                <text
                                    x={lx} y={ly}
                                    textAnchor="middle" dominantBaseline="central"
                                    fill="white" opacity={0.93}
                                    style={{ fontSize: span > 18 ? '8.5px' : '7px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, pointerEvents: 'none' }}
                                    transform={`rotate(${rot},${lx},${ly})`}
                                >
                                    {label}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* ── Inner ring: regions ── */}
                {iSlices.map((seg, i) => {
                    const span = seg.a2 - seg.a1;
                    const mid = (seg.a1 + seg.a2) / 2;
                    const [px, py] = pt(pctR, mid);
                    const [mx, my] = pt(rmid, mid);
                    const rot = radialRot(mid);
                    const pct = `${seg.value.toFixed(1)}%`;
                    const bigFont = span > 120 ? '15px' : span > 60 ? '13px' : '11px';
                    const pctFont = span > 120 ? '12px' : '10px';

                    return (
                        <g key={`i${i}`}>
                            <path
                                d={sector(R0, R1, seg.a1, seg.a2)}
                                fill={seg.color}
                                stroke="#0f172a"
                                strokeWidth={1.5}
                                onMouseEnter={e => onEnter(e, seg.name, seg.value)}
                                onMouseLeave={() => setTip(null)}
                                style={{ cursor: 'pointer' }}
                                onMouseOver={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                                onMouseOut={e => (e.currentTarget.style.filter = '')}
                            />

                            {/* Region name follows the arc (textPath) */}
                            {span > 28 && (
                                <text
                                    fill="white"
                                    style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', fontSize: bigFont, pointerEvents: 'none' }}
                                >
                                    <textPath href={`#ia-${i}`} startOffset="50%" textAnchor="middle">
                                        {seg.name}
                                    </textPath>
                                </text>
                            )}

                            {/* % label near inner edge, rotated radially */}
                            {span > 22 && (
                                <text
                                    x={px} y={py}
                                    textAnchor="middle" dominantBaseline="central"
                                    fill="white" opacity={0.75}
                                    style={{ fontSize: pctFont, fontFamily: "'JetBrains Mono', monospace", pointerEvents: 'none' }}
                                    transform={`rotate(${rot},${px},${py})`}
                                >
                                    {pct}
                                </text>
                            )}

                            {/* Fallback for narrow segments */}
                            {span <= 28 && span > 10 && (
                                <text
                                    x={mx} y={my}
                                    textAnchor="middle" dominantBaseline="central"
                                    fill="white"
                                    style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 'bold', pointerEvents: 'none' }}
                                    transform={`rotate(${rot},${mx},${my})`}
                                >
                                    {seg.name.split(' ').map(w => w[0]).join('')} {pct}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* Center label */}
                {centerLabel && (
                    <text
                        x={CX} y={CY}
                        textAnchor="middle" dominantBaseline="central"
                        fill="#64748b"
                        style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}
                    >
                        {centerLabel}
                    </text>
                )}
            </svg>

            {tip && (
                <div
                    style={{ position: 'absolute', left: tip.x + 14, top: tip.y - 28, pointerEvents: 'none', zIndex: 50 }}
                    className="bg-gray-950 border border-gray-700 rounded-md px-2.5 py-1.5 shadow-xl"
                >
                    <p className="text-xs font-mono font-bold text-white">{tip.name}</p>
                    <p className="text-xs font-mono text-blue-400">{tip.value.toFixed(2)}%</p>
                </div>
            )}
        </div>
    );
};
