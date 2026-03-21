import React from 'react';
import { useThemeColors } from '../hooks/useThemeColors';

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    id: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, id }) => {
    const tc = useThemeColors();
    return (
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => onChange(!checked)}>
            <div className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: checked ? '#2563eb' : tc.gridStroke }}>
                <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                />
            </div>
            <label htmlFor={id} className="text-[10px] font-extrabold text-wallstreet-500 uppercase tracking-widest cursor-pointer select-none group-hover:text-wallstreet-text transition-colors">
                {label}
            </label>
        </div>
    );
};
