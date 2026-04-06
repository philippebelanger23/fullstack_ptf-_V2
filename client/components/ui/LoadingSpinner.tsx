import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
    size?: number;
    className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 20, className = '' }) => (
    <Loader2 className={`animate-spin text-wallstreet-500 ${className}`} size={size} />
);

export const LoadingSpinnerCentered: React.FC<LoadingSpinnerProps & { height?: string }> = ({ size = 24, height = 'h-[350px]', className = '' }) => (
    <div className={`${height} flex items-center justify-center`}>
        <LoadingSpinner size={size} className={className} />
    </div>
);
