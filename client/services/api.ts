import { PortfolioItem } from '../types';

const API_Base_URL = ''; // Use relative path to leverage Vite proxy

// =============================================================================
// CACHE VERSIONING SYSTEM
// Increment version numbers when server-side normalization or data format changes.
// This ensures clients refresh stale cached data.
// =============================================================================
const CACHE_VERSIONS = {
    sector: 2,    // Increment when sector classification logic changes
    beta: 2,      // Increment when beta calculation changes
    dividend: 5,  // Increment when dividend yield normalization changes (was 4)
};

/**
 * Load a versioned cache from localStorage.
 * Returns empty object if version mismatch or load fails.
 */
function loadVersionedCache<T>(cacheKey: string, versionKey: string, currentVersion: number): T | null {
    try {
        const cachedVersion = localStorage.getItem(versionKey);
        if (cachedVersion === String(currentVersion)) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } else {
            // Version mismatch - clear old cache and set new version
            localStorage.removeItem(cacheKey);
            localStorage.setItem(versionKey, String(currentVersion));
            console.info(`Cache version mismatch for ${cacheKey}: clearing stale data`);
        }
    } catch (e) {
        console.warn(`Failed to load ${cacheKey} from localStorage`, e);
    }
    return null;
}

/**
 * Save a versioned cache to localStorage.
 */
function saveVersionedCache<T>(cacheKey: string, data: T): void {
    try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
        console.warn(`Failed to save ${cacheKey} to localStorage`, e);
    }
}

// =============================================================================
// SECTOR CACHE
// =============================================================================
let sectorCache: Record<string, string> = loadVersionedCache('sectorCache', 'sectorCacheVersion', CACHE_VERSIONS.sector) || {};


let indexExposureCache: { sectors: any[], geography: any[] } | null = null;

// =============================================================================
// API FUNCTIONS
// =============================================================================

export const analyzeManualPortfolio = async (items: PortfolioItem[]): Promise<PortfolioItem[]> => {
    try {
        const response = await fetch(`${API_Base_URL}/analyze-manual`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Manual Analysis Error:", error);
        throw error;
    }
};

export const fetchSectors = async (tickers: string[]): Promise<Record<string, string>> => {
    // 1. Filter out tickers we already have in cache
    const missingTickers = tickers.filter(ticker => !sectorCache[ticker]);

    // 2. Fetch only missing tickers
    if (missingTickers.length > 0) {
        try {
            const response = await fetch(`${API_Base_URL}/fetch-sectors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tickers: missingTickers }),
            });

            if (response.ok) {
                const newSectors = await response.json();
                // 3. Update cache
                sectorCache = { ...sectorCache, ...newSectors };
                // Persist to localStorage using versioned helper
                saveVersionedCache('sectorCache', sectorCache);
            } else {
                console.error('Failed to fetch sectors');
            }
        } catch (error) {
            console.error("Error fetching sectors:", error);
        }
    }

    // 4. Return all requested sectors from cache (existing + new)
    const result: Record<string, string> = {};
    tickers.forEach(ticker => {
        if (sectorCache[ticker]) {
            result[ticker] = sectorCache[ticker];
        }
    });

    return result;
};

export const fetchIndexExposure = async (): Promise<{ sectors: any[], geography: any[], last_scraped?: string }> => {
    // Return cached data if available
    // if (indexExposureCache) {
    //     return indexExposureCache;
    // }

    try {
        const response = await fetch(`${API_Base_URL}/index-exposure`);
        if (!response.ok) throw new Error("Failed to fetch index exposure");

        // Cache the result
        indexExposureCache = await response.json();
        return indexExposureCache!;
    } catch (error) {
        console.error("Error fetching index exposure:", error);
        return { sectors: [], geography: [] };
    }
};

export const fetchCurrencyPerformance = async (tickers: string[]): Promise<Record<string, Record<string, number>>> => {
    try {
        const response = await fetch(`${API_Base_URL}/fetch-performance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tickers }),
        });

        if (response.ok) {
            return await response.json();
        } else {
            console.error('Failed to fetch currency performance');
            return {};
        }
    } catch (error) {
        console.error("Error fetching currency performance:", error);
        return {};
    }
};

// =============================================================================
// BETA CACHE
// =============================================================================
let betaCache: Record<string, number> = loadVersionedCache('betaCache', 'betaCacheVersion', CACHE_VERSIONS.beta) || {};

export const fetchBetas = async (tickers: string[]): Promise<Record<string, number>> => {
    // 1. Filter out tickers we already have in cache
    const missingTickers = tickers.filter(ticker => betaCache[ticker] === undefined);

    // 2. Fetch only missing tickers
    if (missingTickers.length > 0) {
        try {
            const response = await fetch(`${API_Base_URL}/fetch-betas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tickers: missingTickers }),
            });

            if (response.ok) {
                const newBetas = await response.json();
                // 3. Update cache
                betaCache = { ...betaCache, ...newBetas };
                // Persist to localStorage using versioned helper
                saveVersionedCache('betaCache', betaCache);
            } else {
                console.error('Failed to fetch betas');
            }
        } catch (error) {
            console.error("Error fetching betas:", error);
        }
    }

    // 4. Return all requested betas from cache (existing + new)
    const result: Record<string, number> = {};
    tickers.forEach(ticker => {
        if (betaCache[ticker] !== undefined) {
            result[ticker] = betaCache[ticker];
        }
    });

    return result;
};

// =============================================================================
// DIVIDEND CACHE
// =============================================================================
let dividendCache: Record<string, number> = loadVersionedCache('dividendCache', 'dividendCacheVersion', CACHE_VERSIONS.dividend) || {};

export const fetchDividends = async (tickers: string[]): Promise<Record<string, number>> => {
    // 1. Filter out tickers we already have in cache
    const missingTickers = tickers.filter(ticker => dividendCache[ticker] === undefined);

    // 2. Fetch only missing tickers
    if (missingTickers.length > 0) {
        try {
            const response = await fetch(`${API_Base_URL}/fetch-dividends`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tickers: missingTickers }),
            });

            if (response.ok) {
                const newDividends = await response.json();
                // 3. Update cache
                dividendCache = { ...dividendCache, ...newDividends };
                // Persist to localStorage using versioned helper
                saveVersionedCache('dividendCache', dividendCache);
            } else {
                console.error('Failed to fetch dividends');
            }
        } catch (error) {
            console.error("Error fetching dividends:", error);
        }
    }

    // 4. Return all requested dividends from cache (existing + new)
    const result: Record<string, number> = {};
    tickers.forEach(ticker => {
        if (dividendCache[ticker] !== undefined) {
            result[ticker] = dividendCache[ticker];
        }
    });

    return result;
};

// In-memory cache for index history data
let indexHistoryCache: {
    data: Record<string, { date: string, value: number }[]> | null;
    timestamp: number;
} = { data: null, timestamp: 0 };

const INDEX_HISTORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const fetchIndexHistory = async (): Promise<Record<string, { date: string, value: number }[]>> => {
    // Check if cache is valid
    const now = Date.now();
    if (indexHistoryCache.data && (now - indexHistoryCache.timestamp) < INDEX_HISTORY_CACHE_TTL) {

        return indexHistoryCache.data;
    }

    try {
        const response = await fetch(`${API_Base_URL}/index-history`);
        if (response.ok) {
            const data = await response.json();
            // Update cache
            indexHistoryCache = { data, timestamp: now };
            return data;
        } else {
            console.error('Failed to fetch index history');
            return { "ACWI": [], "XIU.TO": [], "Index": [] };
        }
    } catch (error) {
        console.error("Error fetching index history:", error);
        return { "ACWI": [], "XIU.TO": [], "Index": [] };
    }
};

export const savePortfolioConfig = async (config: { tickers: any[], periods: any[] }): Promise<void> => {
    try {
        const response = await fetch(`${API_Base_URL}/save-portfolio-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        });

        if (!response.ok) {
            throw new Error(`Failed to save portfolio config: ${response.statusText}`);
        }
    } catch (error) {
        console.error("Error saving portfolio config:", error);
        throw error;
    }
};

export const loadPortfolioConfig = async (): Promise<{ tickers: any[], periods: any[] }> => {
    try {
        const response = await fetch(`${API_Base_URL}/load-portfolio-config`);
        if (!response.ok) {
            throw new Error(`Failed to load portfolio config: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error loading portfolio config:", error);
        return { tickers: [], periods: [] };
    }
};

export const saveSectorWeights = async (weights: Record<string, Record<string, number>>): Promise<void> => {
    try {
        const response = await fetch(`${API_Base_URL}/save-sector-weights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weights }),
        });
        if (!response.ok) throw new Error("Failed to save sector weights");
    } catch (error) {
        console.error("Error saving sector weights:", error);
        throw error;
    }
};

export const loadSectorWeights = async (): Promise<Record<string, Record<string, number>>> => {
    try {
        const response = await fetch(`${API_Base_URL}/load-sector-weights`);
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.error("Error loading sector weights:", error);
        return {};
    }
};

export const saveAssetGeo = async (geo: Record<string, string>): Promise<void> => {
    try {
        const response = await fetch(`${API_Base_URL}/save-asset-geo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geo }),
        });
        if (!response.ok) throw new Error("Failed to save asset geography");
    } catch (error) {
        console.error("Error saving asset geography:", error);
        throw error;
    }
};

export const loadAssetGeo = async (): Promise<Record<string, string>> => {
    try {
        const response = await fetch(`${API_Base_URL}/load-asset-geo`);
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.error("Error loading asset geography:", error);
        return {};
    }
};

export const checkNavLag = async (tickers: string[], forceRefresh: boolean = false, referenceDate?: string): Promise<Record<string, any>> => {
    try {
        const response = await fetch(`${API_Base_URL}/check-nav-lag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tickers,
                force_refresh: forceRefresh,
                reference_date: referenceDate,
                _t: Date.now()  // Cache buster
            }),
        });
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.error("Error checking NAV lag:", error);
        return {};
    }
};

export const uploadNav = async (ticker: string, file: File): Promise<void> => {
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_Base_URL}/upload-nav/${ticker}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to upload NAV: ${errorText}`);
        }
    } catch (error) {
        console.error(`Error uploading NAV for ${ticker}:`, error);
        throw error;
    }
};

export const convertConfigToItems = (tickers: any[], periods: any[]): PortfolioItem[] => {
    const flatItems: PortfolioItem[] = [];
    periods.forEach(period => {
        tickers.forEach(t => {
            const rawWeight = period.weights[t.ticker] || '0';
            // All weights in config are stored as percentages (e.g., "10.00" means 10%, "0.50%" also means 0.5%)
            // Just strip the % sign if present and parse as a number
            const weight = parseFloat(rawWeight.toString().replace('%', ''));

            if (weight > 0) {
                flatItems.push({
                    ticker: t.ticker,
                    weight: weight,  // Pass as percentage value (e.g., 10.00 for 10%)
                    date: period.startDate,
                    isMutualFund: t.isMutualFund || false,
                    isEtf: t.isEtf || false,
                });
            }
        });
    });
    return flatItems;
};

export interface BackcastMetrics {
    totalReturn: number;
    benchmarkReturn: number;
    alpha: number;
    sharpeRatio: number;
    sortinoRatio: number;
    informationRatio: number;
    trackingError: number;
    volatility: number;
    beta: number;
    maxDrawdown: number;
    benchmarkMaxDrawdown: number;
    benchmarkVolatility: number;
    benchmarkSharpe: number;
    benchmarkSortino: number;
}

export interface BackcastSeriesPoint {
    date: string;
    portfolio: number;
    benchmark: number;
}

export interface BackcastResponse {
    metrics: BackcastMetrics;
    series: BackcastSeriesPoint[];
    missingTickers: string[];
    error?: string;
}

export const fetchPortfolioBackcast = async (items: PortfolioItem[]): Promise<BackcastResponse> => {
    try {
        const response = await fetch(`${API_Base_URL}/portfolio-backcast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ items }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Portfolio Backcast Error:", error);
        return {
            metrics: {
                totalReturn: 0, benchmarkReturn: 0, alpha: 0, sharpeRatio: 0, sortinoRatio: 0,
                informationRatio: 0, trackingError: 0, volatility: 0, beta: 0, maxDrawdown: 0,
                benchmarkMaxDrawdown: 0, benchmarkVolatility: 0, benchmarkSharpe: 0, benchmarkSortino: 0
            },
            series: [],
            missingTickers: [],
            error: String(error)
        };
    }
};

