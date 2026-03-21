import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number | React.ReactNode;
    subtext?: string;
    icon?: LucideIcon | null;
    colorClass?: string;
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, subtext, icon: Icon, colorClass = 'text-wallstreet-text' }) => (
    <div className="bg-wallstreet-800 p-5 rounded-xl border border-wallstreet-700 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start z-10 w-full">
            <div className="w-full">
                <h4 className="text-xs font-bold font-mono text-wallstreet-500 uppercase tracking-wider mb-2 border-b border-wallstreet-100 pb-2 w-full">{title}</h4>
                <div className={`text-2xl font-bold font-mono ${colorClass} w-full`}>{value}</div>
            </div>
            {Icon && (
                <div className="p-2 bg-wallstreet-900 rounded-lg text-wallstreet-500 group-hover:text-wallstreet-accent transition-colors"><Icon size={18} /></div>
            )}
        </div>
        {subtext && <div className="z-10 mt-auto"><span className="text-[10px] font-mono text-wallstreet-500 bg-wallstreet-100 px-2 py-1 rounded inline-block">{subtext}</span></div>}
        {Icon && <Icon size={80} className="absolute -bottom-4 -right-4 text-wallstreet-100 opacity-20 transform -rotate-12 pointer-events-none" />}
    </div>
);
