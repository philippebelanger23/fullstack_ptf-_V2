import React from 'react';
import { formatBps } from '../../utils/formatters';
import { TableItem } from './attributionUtils';

export const AttributionTable = ({ title, items, isQuarter = false, status = 'COMPLETED' }: { title: string, items: TableItem[], isQuarter?: boolean, status?: 'COMPLETED' | 'IN_PROGRESS' }) => {
    const positives = items.filter(i => i.contribution >= 0).sort((a, b) => b.contribution - a.contribution);
    const negatives = items.filter(i => i.contribution < 0).sort((a, b) => a.contribution - b.contribution);
    const topContributors = positives.slice(0, 5);
    const topContribSum = topContributors.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });
    const topDisruptors = negatives.slice(0, 5);
    const topDisruptSum = topDisruptors.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });
    const topTickerSet = new Set([...topContributors, ...topDisruptors].map(i => i.ticker));
    const others = items.filter(i => !topTickerSet.has(i.ticker));
    const othersSum = others.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });

    // User Request: Force Other Holdings Weight to be the residual so Total is always 100%
    // Weight = 100% - Sum(TopContributors) - Sum(TopDisruptors)
    const residualOtherWeight = 100 - topContribSum.weight - topDisruptSum.weight;

    // Recalculate Performance based on the Fixed Weight
    // Formula: Return = (Contribution * 100) / Weight  (derived from Contrib = Weight/100 * Return)
    const othersReturn = residualOtherWeight > 0.001 ? (othersSum.contribution * 100) / residualOtherWeight : 0;

    const totalSum = items.reduce((acc, i) => ({ weight: acc.weight + i.weight, contribution: acc.contribution + i.contribution }), { weight: 0, contribution: 0 });

    const RenderRow = ({ item, isBold = false, isSum = false }: { item: TableItem | any, isBold?: boolean, isSum?: boolean }) => (
        <tr className={`${isSum ? 'border-t-2 border-gray-300 bg-white' : 'border-b border-wallstreet-100 last:border-0'}`}>
            <td className={`p-1 px-3 text-left ${isBold || isSum ? 'font-bold' : 'font-medium'} text-black truncate`}>{isSum ? 'Σ' : item.ticker}</td>
            <td className={`p-1 px-2 text-center ${isBold || isSum ? 'font-bold' : ''} text-black`}>{item.weight.toFixed(2)}%</td>
            <td className={`p-1 px-2 text-center ${isBold || isSum ? 'font-bold' : ''} ${item.returnPct !== undefined ? (item.returnPct >= 0 ? 'text-green-700' : 'text-red-700') : 'text-gray-400'}`}>
                {item.returnPct !== undefined ? (item.returnPct < 0 ? `(${Math.abs(item.returnPct).toFixed(2)}%)` : `${item.returnPct.toFixed(2)}%`) : ''}
            </td>
            <td className={`p-1 px-2 text-right font-bold pr-4 ${item.contribution >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatBps(item.contribution)}
            </td>
        </tr>
    );

    return (
        <div className={`${isQuarter ? 'bg-black' : 'bg-white'} rounded-xl shadow-sm flex flex-col h-full font-mono text-xs overflow-hidden print-table ${isQuarter ? 'border-4 border-black' : 'border-4 border-[#f1f5f9]'}`}>
            {/* Title Row */}
            <div className={`py-4 text-center font-bold uppercase tracking-wider text-sm ${
                status === 'IN_PROGRESS' ? 'bg-[#d1d5db] text-slate-800' : 'bg-black text-white'
            }`}>
                {title}
            </div>

            <div className={`flex-1 overflow-x-auto ${isQuarter ? 'bg-white' : ''}`}>
                <table className="w-full">
                    {/* Top Contributors Section */}
                    <thead>
                        {/* Spacer Row */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        {/* Section Title - Light Grey Background for seamless look */}
                        <tr className="bg-white">
                            <td colSpan={4} className="text-center font-bold text-black py-1.5 uppercase tracking-wide text-xs">Top Contributors</td>
                        </tr>

                        {/* Column Headers */}
                        <tr className="bg-black text-white text-[10px] uppercase">
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Ticker</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Weight</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Performance</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Contrib. (bps)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topContributors.map((item, idx) => <RenderRow key={idx} item={item} />)}
                        <RenderRow item={{ ticker: '', weight: topContribSum.weight, returnPct: undefined, contribution: topContribSum.contribution }} isSum={true} />
                    </tbody>

                    {/* Top Disruptors Section */}
                    <thead>
                        {/* Spacer Row */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        {/* Section Title */}
                        <tr className="bg-white ">
                            <td colSpan={4} className="text-center font-bold text-black py-1.5 uppercase tracking-wide text-xs">Top Disruptors</td>
                        </tr>

                        {/* Column Headers */}
                        <tr className="bg-black text-white text-[10px] uppercase">
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Ticker</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Weight</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Performance</th>
                            <th className="p-1.5 px-2 text-center font-bold w-1/4">Contrib. (bps)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topDisruptors.map((item, idx) => <RenderRow key={idx} item={item} />)}
                        <RenderRow item={{ ticker: '', weight: topDisruptSum.weight, returnPct: undefined, contribution: topDisruptSum.contribution }} isSum={true} />
                    </tbody>

                    {/* Footer Section */}
                    <tfoot>
                        {/* Spacer Row equivalent to Top Disruptors gap */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        <tr className="">
                            <td className="p-1 px-3 text-left font-bold text-black">Other Holdings</td>
                            <td className="p-1 px-2 text-center font-medium">{residualOtherWeight.toFixed(2)}%</td>
                            <td className={`p-1 px-2 text-center font-medium ${othersReturn < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {othersReturn < 0 ? `(${Math.abs(othersReturn).toFixed(2)}%)` : `${othersReturn.toFixed(2)}%`}
                            </td>
                            <td className={`p-1 px-2 text-right font-bold pr-4 ${othersSum.contribution < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {formatBps(othersSum.contribution)}
                            </td>
                        </tr>

                        {/* Gap between Other Holdings and Total Portfolio */}
                        <tr className="h-4 bg-white"><td colSpan={4}></td></tr>

                        {/* Total Portfolio - Grey Background */}
                        <tr className="bg-[#d1d5db]">
                            <td className="p-1.5 px-3 text-left font-extrabold text-black">Total Portfolio</td>
                            <td className="p-1.5 px-2 text-center font-bold text-black">100.00%</td>
                            <td className="p-1.5 px-2 text-center font-bold text-gray-500"></td>
                            <td className={`p-1.5 px-2 text-right font-extrabold pr-4 ${totalSum.contribution < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                {formatBps(totalSum.contribution)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
