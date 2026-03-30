import React from 'react';
import { formatBps } from '../../utils/formatters';
import { TableItem } from './attributionUtils';

export const AttributionTable = ({ title, items, isQuarter = false, status = 'COMPLETED', contributionFormat = 'bps', compact = false, totalContribution, totalLabel = 'Total Portfolio' }: { title: string, items: TableItem[], isQuarter?: boolean, status?: 'COMPLETED' | 'IN_PROGRESS', contributionFormat?: 'bps' | 'pct', compact?: boolean, totalContribution?: number, totalLabel?: string }) => {
    const fmtContrib = (v: number) => contributionFormat === 'pct'
        ? (v >= 0 ? `+${v.toFixed(2)}%` : `(${Math.abs(v).toFixed(2)}%)`)
        : formatBps(v);
    const contribHeader = contributionFormat === 'pct' ? 'Contrib. (%)' : 'Contrib. (bps)';
    const positives = items.filter(i => i.contribution >= 0).sort((a, b) => b.contribution - a.contribution);
    const negatives = items.filter(i => i.contribution < 0).sort((a, b) => a.contribution - b.contribution);
    const topContributors = positives.slice(0, 5);
    const topContribSum = topContributors.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });
    const topDisruptors = negatives.slice(0, 5);
    const topDisruptSum = topDisruptors.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });
    const topTickerSet = new Set([...topContributors, ...topDisruptors].map(i => i.ticker));
    const others = items.filter(i => !topTickerSet.has(i.ticker));
    const othersSum = others.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });

    // Residual bucket: force the non-top holdings row to absorb the leftover weight
    // so the section total is always 100%.
    const residualOtherWeight = 100 - topContribSum.weight - topDisruptSum.weight;

    // Recalculate performance based on the residual weight so the bucket remains explicit.
    // Formula: Return = (Contribution * 100) / Weight  (derived from Contrib = Weight/100 * Return)
    const othersReturn = residualOtherWeight > 0.001 ? (othersSum.contribution * 100) / residualOtherWeight : 0;

    const totalSum = items.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });

    // Pad to always show 5 rows even if fewer positives/negatives exist
    const paddedContributors = [...topContributors, ...Array(Math.max(0, 5 - topContributors.length)).fill(null)];
    const paddedDisruptors = [...topDisruptors, ...Array(Math.max(0, 5 - topDisruptors.length)).fill(null)];

    const RenderRow = ({ item, isBold = false, isSum = false }: { item: TableItem | any, isBold?: boolean, isSum?: boolean }) => (
        <tr className={`${isSum ? 'border-t-2 border-wallstreet-700 bg-wallstreet-800' : 'border-b border-wallstreet-100 last:border-0'}`}>
            <td className={`p-1 px-3 text-left ${isBold || isSum ? 'font-bold' : 'font-medium'} text-wallstreet-text truncate`}>{isSum ? 'Σ' : item.ticker}</td>
            <td className={`p-1 px-2 text-center ${isBold || isSum ? 'font-bold' : ''} text-wallstreet-text`}>{item.weight.toFixed(2)}%</td>
            <td className={`p-1 px-2 text-center ${isBold || isSum ? 'font-bold' : ''} ${item.returnPct !== undefined ? (item.returnPct >= 0 ? 'text-green-700' : 'text-red-700') : 'text-wallstreet-500'}`}>
                {item.returnPct !== undefined ? (item.returnPct < 0 ? `(${Math.abs(item.returnPct).toFixed(2)}%)` : `${item.returnPct.toFixed(2)}%`) : ''}
            </td>
            <td className={`p-1 px-2 text-center font-bold ${item.contribution >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {fmtContrib(item.contribution)}
            </td>
        </tr>
    );

    return (
        <div className={`${isQuarter ? 'bg-black' : 'bg-wallstreet-800'} rounded-xl shadow-sm flex flex-col ${compact ? 'h-auto' : 'h-full'} font-mono text-xs overflow-hidden print-table ${isQuarter ? 'border-4 border-black' : 'border-4 border-wallstreet-700'}`}>
            {/* Title Row */}
            <div
                className={`py-2 text-center font-bold uppercase tracking-wider text-sm ${status === 'IN_PROGRESS' ? 'text-white' : 'bg-black text-white'}`}
                style={status === 'IN_PROGRESS' ? { backgroundColor: '#4a4c4e' } : undefined}
            >
                {title}
            </div>

            <div className={`flex-1 overflow-x-auto ${isQuarter ? 'bg-wallstreet-800' : ''}`}>
                <table className="w-full">
                    {/* Top Contributors Section */}
                    <thead>
                        {/* Spacer Row */}
                        <tr className="h-3 bg-wallstreet-800"><td colSpan={4}></td></tr>

                        {/* Section Title - Light Grey Background for seamless look */}
                        <tr className="bg-wallstreet-800">
                            <td colSpan={4} className="text-center font-bold text-wallstreet-text py-1 uppercase tracking-wide text-xs">Top Contributors</td>
                        </tr>

                        {/* Column Headers */}
                        <tr className="bg-black text-white text-[10px] uppercase">
                            <th className="p-1 px-2 text-center font-bold w-1/4">Ticker</th>
                            <th className="p-1 px-2 text-center font-bold w-1/4">Weight</th>
                            <th className="p-1 px-2 text-center font-bold w-1/4">Performance</th>
                            <th className="p-1 px-2 text-center font-bold w-1/4">{contribHeader}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paddedContributors.map((item, idx) => item
            ? <RenderRow key={idx} item={item} />
            : <tr key={idx} className="border-b border-wallstreet-100"><td className="p-1 px-3">&nbsp;</td><td /><td /><td /></tr>
        )}
                        <RenderRow item={{ ticker: '', weight: topContribSum.weight, returnPct: undefined, contribution: topContribSum.contribution }} isSum={true} />
                    </tbody>

                    {/* Top Disruptors Section */}
                    <thead>
                        {/* Spacer Row */}
                        <tr className="h-3 bg-wallstreet-800"><td colSpan={4}></td></tr>

                        {/* Section Title */}
                        <tr className="bg-wallstreet-800">
                            <td colSpan={4} className="text-center font-bold text-wallstreet-text py-1 uppercase tracking-wide text-xs">Top Disruptors</td>
                        </tr>

                        {/* Column Headers */}
                        <tr className="bg-black text-white text-[10px] uppercase">
                            <th className="p-1 px-2 text-center font-bold w-1/4">Ticker</th>
                            <th className="p-1 px-2 text-center font-bold w-1/4">Weight</th>
                            <th className="p-1 px-2 text-center font-bold w-1/4">Performance</th>
                            <th className="p-1 px-2 text-center font-bold w-1/4">{contribHeader}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paddedDisruptors.map((item, idx) => item
            ? <RenderRow key={idx} item={item} />
            : <tr key={idx} className="border-b border-wallstreet-100"><td className="p-1 px-3">&nbsp;</td><td /><td /><td /></tr>
        )}
                        <RenderRow item={{ ticker: '', weight: topDisruptSum.weight, returnPct: undefined, contribution: topDisruptSum.contribution }} isSum={true} />
                    </tbody>

                    {/* Footer Section */}
                    <tfoot>
                        {/* Spacer Row equivalent to Top Disruptors gap */}
                        <tr className="h-3 bg-wallstreet-800"><td colSpan={4}></td></tr>

                        <tr className="">
                            <td className="p-1 px-3 text-left font-bold text-wallstreet-text">Residual Holdings</td>
                            <td className="p-1 px-2 text-center font-medium">{residualOtherWeight.toFixed(2)}%</td>
                            <td className={`p-1 px-2 text-center font-medium ${othersReturn < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {othersReturn < 0 ? `(${Math.abs(othersReturn).toFixed(2)}%)` : `${othersReturn.toFixed(2)}%`}
                            </td>
                            <td className={`p-1 px-2 text-center font-bold ${othersSum.contribution < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {fmtContrib(othersSum.contribution)}
                            </td>
                        </tr>

                        {/* Gap between Residual Holdings and Total Portfolio */}
                        <tr className="h-3 bg-wallstreet-800"><td colSpan={4}></td></tr>

                        {/* Total row - Grey Background */}
                        <tr className="bg-wallstreet-900">
                            <td className="p-1.5 px-3 text-left font-extrabold text-wallstreet-text">{totalLabel}</td>
                            <td className="p-1.5 px-2 text-center font-bold text-wallstreet-text">100.00%</td>
                            <td className="p-1.5 px-2 text-center font-bold text-wallstreet-500"></td>
                            <td className={`p-1.5 px-2 text-center font-extrabold ${(totalContribution ?? totalSum.contribution) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {fmtContrib(totalContribution ?? totalSum.contribution)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
