import { useSyncExternalStore } from 'react';

const getIsDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

const subscribe = (cb: () => void) => {
    const observer = new MutationObserver(cb);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
};

export function useThemeColors() {
    const isDark = useSyncExternalStore(subscribe, getIsDark, () => false);

    return {
        isDark,
        gridStroke: isDark ? '#334155' : '#e2e8f0',
        gridStrokeLight: isDark ? '#1e293b' : '#f1f5f9',
        tickFill: isDark ? '#94a3b8' : '#64748b',
        tooltipBg: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.95)',
        tooltipBgSolid: isDark ? '#1e293b' : '#ffffff',
        tooltipBorder: isDark ? '#334155' : '#e2e8f0',
        tooltipText: isDark ? '#f1f5f9' : '#1e293b',
        tooltipMuted: isDark ? '#94a3b8' : '#64748b',
        axisStroke: isDark ? '#334155' : '#e2e8f0',
        referenceLine: isDark ? '#475569' : '#94a3b8',
    };
}
