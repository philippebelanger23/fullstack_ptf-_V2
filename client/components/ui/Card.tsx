import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
    <div className={`bg-wallstreet-800 p-5 rounded-xl border border-wallstreet-700 shadow-sm ${className}`}>
        {children}
    </div>
);
