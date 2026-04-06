import React from 'react';

interface SectionHeaderProps {
    children: React.ReactNode;
    className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ children, className = '' }) => (
    <h3 className={`text-wallstreet-500 text-xs font-medium mb-1 uppercase tracking-wider ${className}`}>
        {children}
    </h3>
);
