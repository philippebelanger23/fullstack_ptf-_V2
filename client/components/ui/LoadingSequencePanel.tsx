import React from 'react';

export type LoadStatus = 'pending' | 'done' | 'error';

export type LoadStep = {
    key: string;
    label: string;
    sub: string;
    status: LoadStatus;
};

interface LoadingSequencePanelProps {
    title: string;
    steps: LoadStep[];
    className?: string;
}

const BAR_HEIGHTS = [28, 50, 36, 66, 42, 78, 54, 92, 46, 72, 58, 88, 64];

export const LoadingSequencePanel: React.FC<LoadingSequencePanelProps> = ({ title, steps, className = '' }) => {
    const doneCount = steps.reduce((count, step) => count + (step.status === 'done' ? 1 : 0), 0);
    const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0;

    return (
        <div className={`flex flex-col items-center gap-8 w-full max-w-sm ${className}`}>
            <style>{`
                @keyframes loadingSeqBarPulse {
                    0%, 100% { transform: scaleY(0.12); opacity: 0.1; }
                    50%      { transform: scaleY(1);    opacity: 1;   }
                }
                @keyframes loadingSeqScanLine {
                    0%   { left: -2px; }
                    100% { left: calc(100% + 2px); }
                }
                @keyframes loadingSeqStepPulse {
                    0%, 100% { opacity: 0.45; transform: translateY(0); }
                    50%      { opacity: 1; transform: translateY(-1px); }
                }
            `}</style>

            <div className="relative overflow-hidden rounded" style={{ width: '176px', height: '60px' }}>
                <div className="flex items-end h-full gap-1.5">
                    {BAR_HEIGHTS.map((h, i) => (
                        <div
                            key={i}
                            className="flex-1 rounded-t-sm origin-bottom"
                            style={{
                                height: `${h}%`,
                                background: i === BAR_HEIGHTS.length - 1 ? 'var(--wallstreet-accent)' : 'var(--wallstreet-700)',
                                animation: `loadingSeqBarPulse 2.2s ease-in-out ${i * 0.14}s infinite`,
                            }}
                        />
                    ))}
                </div>
                <div
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                        background: 'linear-gradient(to bottom, transparent, rgba(10,35,81,0.72), transparent)',
                        animation: 'loadingSeqScanLine 2.2s linear infinite',
                    }}
                />
            </div>

            <p className="text-[11px] font-mono text-wallstreet-500 tracking-[0.28em] uppercase">
                {title}
            </p>

            <div className="w-full bg-wallstreet-700 rounded-full h-1.5 overflow-hidden">
                <div
                    className="bg-wallstreet-accent h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="w-full space-y-3">
                {steps.map(({ key, label, sub, status }, index) => (
                    <div
                        key={key}
                        className="flex items-center gap-3"
                        style={{ animation: `loadingSeqStepPulse 2.2s ease-in-out ${index * 0.16}s infinite` }}
                    >
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                            {status === 'done' ? (
                                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            ) : status === 'error' ? (
                                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <div className="w-3.5 h-3.5 border-2 border-wallstreet-600 border-t-wallstreet-accent rounded-full animate-spin" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-sm font-mono font-medium ${
                                status === 'done'
                                    ? 'text-wallstreet-text'
                                    : status === 'error'
                                        ? 'text-red-500'
                                        : 'text-wallstreet-500'
                            }`}>
                                {label}
                            </p>
                            <p className="text-xs text-wallstreet-500 truncate">{sub}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
