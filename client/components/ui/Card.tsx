import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
    <div className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${className}`}>
        {children}
    </div>
);
