import React, { useState, useEffect } from 'react';

interface FreshnessBadgeProps {
    fetchedAt: string | null; // ISO timestamp or null
}

function getRelativeTime(fetchedAt: string): { label: string; level: 'fresh' | 'stale' | 'old' } {
    const ageMs = Date.now() - new Date(fetchedAt).getTime();
    const minutes = Math.floor(ageMs / 60_000);
    const hours = Math.floor(ageMs / 3_600_000);
    const days = Math.floor(ageMs / 86_400_000);

    let label: string;
    if (minutes < 1) label = 'just now';
    else if (minutes < 60) label = `${minutes}m ago`;
    else if (hours < 24) label = `${hours}h ago`;
    else label = `${days}d ago`;

    let level: 'fresh' | 'stale' | 'old';
    if (ageMs < 3_600_000) level = 'fresh';        // < 1 hour
    else if (ageMs < 86_400_000) level = 'stale';   // < 24 hours
    else level = 'old';                              // > 24 hours

    return { label, level };
}

const DOT_COLORS = {
    fresh: 'bg-green-500',
    stale: 'bg-amber-500',
    old: 'bg-red-500',
};

export const FreshnessBadge: React.FC<FreshnessBadgeProps> = ({ fetchedAt }) => {
    const [, setTick] = useState(0);

    // Re-render every 60s to keep relative time accurate
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60_000);
        return () => clearInterval(interval);
    }, []);

    if (!fetchedAt) return null;

    const { label, level } = getRelativeTime(fetchedAt);

    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-wallstreet-500" title={`Fetched: ${new Date(fetchedAt).toLocaleString()}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[level]}`} />
            {label}
        </span>
    );
};
