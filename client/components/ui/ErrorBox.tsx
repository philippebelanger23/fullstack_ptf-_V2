import React from 'react';

interface ErrorBoxProps {
    children: React.ReactNode;
    className?: string;
}

export const ErrorBox: React.FC<ErrorBoxProps> = ({ children, className = '' }) => (
    <div className={`p-8 bg-red-50 text-red-900 border border-red-200 rounded-lg ${className}`}>
        {children}
    </div>
);
