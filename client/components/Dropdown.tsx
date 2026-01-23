import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownOption {
    value: string | number;
    label: string | number;
}

interface DropdownProps {
    options: DropdownOption[];
    value: string | number;
    onChange: (value: any) => void;
    labelPrefix?: string;
    className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({ options, value, onChange, labelPrefix, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between gap-3 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-wallstreet-accent/10 min-w-[120px]"
            >
                <div className="flex items-center gap-2">
                    {labelPrefix && (
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{labelPrefix}</span>
                    )}
                    <span className="text-sm font-bold text-slate-700 font-mono">{selectedOption.label}</span>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-[100] mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top">
                    {options.map((option) => (
                        <div
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={`px-4 py-2.5 text-sm font-bold font-mono cursor-pointer transition-colors duration-150 
                                ${option.value === value
                                    ? 'bg-wallstreet-accent text-white'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-wallstreet-accent'}`}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
