import { BenchmarkWorkspaceResponse, PortfolioItem, PortfolioWorkspaceResponse } from '../types';

const API_Base_URL = ''; // Use relative path to leverage Vite proxy

// =============================================================================
// CACHE VERSIONING SYSTEM
// Increment version numbers when server-side normalization or data format changes.
// This ensures clients refresh stale cached data.
// =============================================================================
const CACHE_VERSIONS = {
    sector: 3,    // Increment when sector classification logic changes (v3: ATD.TO override → Consumer Staples)
    beta: 2,      // Increment when beta calculation changes
    dividend: 6,  // Increment when dividend yield normalization changes (was 5: yfinance 1.2.0 returns dividendYield as % directly)
};

type RequestCacheEntry<T> = {
    timestamp: number;
    value: T;
};

const requestCache = new Map<string, RequestCacheEntry<unknown>>();
const requestInflight = new Map<string, Promise<unknown>>();
const REQUEST_CACHE_TTL_MS = 2000;

function getCachedRequest<T>(cacheKey: string, ttlMs: number): T | null {
    const entry = requestCache.get(cacheKey) as RequestCacheEntry<T> | undefined;
    if (!entry) return null;
    if ((Date.now() - entry.timestamp) > ttlMs) {
        requestCache.delete(cacheKey);
        return null;
    }
    return entry.value;
}

function setCachedRequest<T>(cacheKey: string, value: T): T {
    requestCache.set(cacheKey, { timestamp: Date.now(), value });
    return value;
}

function invalidateRequestCache(prefix: string) {
    for (const key of requestCache.keys()) {
        if (key === prefix || key.startsWith(prefix)) {
            requestCache.delete(key);
        }
    }
}

async function memoizedRequest<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    ttlMs: number = REQUEST_CACHE_TTL_MS
): Promise<T> {
    const cached = getCachedRequest<T>(cacheKey, ttlMs);
    if (cached !== null) return cached;

    const inflight = requestInflight.get(cacheKey) as Promise<T> | undefined;
    if (inflight) return inflight;

    const request = fetcher()
        .then(result => setCachedRequest(cacheKey, result))
        .finally(() => {
            requestInflight.delete(cacheKey);
        });

    requestInflight.set(cacheKey, request);
    return request;
}

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
// GENERIC CACHED FETCH HELPER
// =============================================================================

/**
 * Creates a cached fetch function that:
 * 1. Checks local cache for existing data
 * 2. Fetches only missing tickers from the server
 * 3. Merges results and persists to localStorage
 */
function createCachedFetcher<T>(
    endpoint: string,
    cacheKey: string,
    versionKey: string,
    version: number,
    isMissing: (cache: Record<string, T>, ticker: string) => boolean = (cache, ticker) => cache[ticker] === undefined,
) {
    let cache: Record<string, T> = loadVersionedCache(cacheKey, versionKey, version) || {};

    return async (tickers: string[]): Promise<Record<string, T>> => {
        const normalizedTickers = Array.from(new Set(tickers.map(ticker => ticker.trim()))).sort();
        const missingTickers = normalizedTickers.filter(ticker => isMissing(cache, ticker));

        if (missingTickers.length > 0) {
            try {
                const requestKey = `${endpoint}:${missingTickers.join(',')}`;
                const newData = await memoizedRequest<Record<string, T>>(requestKey, async () => {
                    const response = await fetch(`${API_Base_URL}/${endpoint}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tickers: missingTickers }),
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${endpoint}`);
                    }

                    return await response.json();
                });

                cache = { ...cache, ...newData };
                saveVersionedCache(cacheKey, cache);
            } catch (error) {
                console.error(`Error fetching ${endpoint}:`, error);
            }
        }

        const result: Record<string, T> = {};
        normalizedTickers.forEach(ticker => {
            if (cache[ticker] !== undefined) {
                result[ticker] = cache[ticker];
            }
        });
        return result;
    };
}

// =============================================================================
// CACHED API FUNCTIONS
// =============================================================================
export const fetchSectors = createCachedFetcher<string>(
    'fetch-sectors', 'sectorCache', 'sectorCacheVersion', CACHE_VERSIONS.sector,
    (cache, ticker) => !cache[ticker],
);

export const fetchBetas = createCachedFetcher<number>(
    'fetch-betas', 'betaCache', 'betaCacheVersion', CACHE_VERSIONS.beta,
);

export const fetchDividends = createCachedFetcher<number>(
    'fetch-dividends', 'dividendCache', 'dividendCacheVersion', CACHE_VERSIONS.dividend,
);

// =============================================================================
// NON-CACHED API FUNCTIONS
// =============================================================================

/** Build the canonical portfolio workspace used by the live app. */
export const fetchPortfolioWorkspace = async (items: PortfolioItem[]): Promise<PortfolioWorkspaceResponse> => {
    const response = await fetch(`${API_Base_URL}/portfolio-workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
};

export const fetchBenchmarkWorkspace = async (): Promise<BenchmarkWorkspaceResponse> => {
    return memoizedRequest('GET /benchmark-workspace', async () => {
        const response = await fetch(`${API_Base_URL}/benchmark-workspace`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch benchmark workspace: ${response.status} ${errorText}`);
        }
        return await response.json();
    }, 2000);
};

export const triggerIndexRefresh = async (): Promise<{ status: string; builtAt?: string | null; stale?: boolean; errors?: Record<string, string> }> => {
    const response = await fetch(`${API_Base_URL}/index-refresh`, { method: 'POST' });
    if (!response.ok) throw new Error("Index refresh failed");
    invalidateRequestCache('GET /benchmark-workspace');
    return response.json();
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
        invalidateRequestCache('GET /load-portfolio-config');
    } catch (error) {
        console.error("Error saving portfolio config:", error);
        throw error;
    }
};

export const loadPortfolioConfig = async (): Promise<{ tickers: any[], periods: any[] }> => {
    return memoizedRequest('GET /load-portfolio-config', async () => {
        const response = await fetch(`${API_Base_URL}/load-portfolio-config`);
        if (!response.ok) {
            throw new Error(`Failed to load portfolio config: ${response.statusText}`);
        }
        return await response.json();
    });
};

export const saveSectorWeights = async (weights: Record<string, Record<string, number>>): Promise<void> => {
    try {
        const response = await fetch(`${API_Base_URL}/save-sector-weights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ weights }),
        });
        if (!response.ok) throw new Error("Failed to save sector weights");
        invalidateRequestCache('GET /load-sector-weights');
    } catch (error) {
        console.error("Error saving sector weights:", error);
        throw error;
    }
};

export const loadSectorWeights = async (): Promise<Record<string, Record<string, number>>> => {
    return memoizedRequest('GET /load-sector-weights', async () => {
        try {
            const response = await fetch(`${API_Base_URL}/load-sector-weights`);
            if (!response.ok) return {};
            return await response.json();
        } catch (error) {
            console.error("Error loading sector weights:", error);
            return {};
        }
    });
};

export const saveAssetGeo = async (geo: Record<string, string>): Promise<void> => {
    try {
        const response = await fetch(`${API_Base_URL}/save-asset-geo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geo }),
        });
        if (!response.ok) throw new Error("Failed to save asset geography");
        invalidateRequestCache('GET /load-asset-geo');
    } catch (error) {
        console.error("Error saving asset geography:", error);
        throw error;
    }
};

export const loadAssetGeo = async (): Promise<Record<string, string>> => {
    return memoizedRequest('GET /load-asset-geo', async () => {
        try {
            const response = await fetch(`${API_Base_URL}/load-asset-geo`);
            if (!response.ok) return {};
            return await response.json();
        } catch (error) {
            console.error("Error loading asset geography:", error);
            return {};
        }
    });
};

export const checkNavLag = async (tickers: string[], forceRefresh: boolean = false, referenceDate: string): Promise<Record<string, any>> => {
    const normalizedTickers = Array.from(new Set(tickers.map(ticker => ticker.trim()))).sort();
    const cacheKey = `POST /check-nav-lag:${normalizedTickers.join(',')}:${forceRefresh}:${referenceDate || ''}`;
    return memoizedRequest(cacheKey, async () => {
        try {
            const response = await fetch(`${API_Base_URL}/check-nav-lag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tickers: normalizedTickers,
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
    }, 1000);
};

export const saveManualNav = async (ticker: string, date: string, nav: number): Promise<void> => {
    const response = await fetch(`${API_Base_URL}/save-manual-nav`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, date, nav }),
    });
    if (!response.ok) throw new Error("Failed to save manual NAV");
    invalidateRequestCache('GET /nav-audit');
    invalidateRequestCache('POST /check-nav-lag');
};

export const fetchNavAudit = async (): Promise<Record<string, { date: string, nav: number, source: string, returnPct: number | null }[]>> => {
    return memoizedRequest('GET /nav-audit', async () => {
        try {
            const response = await fetch(`${API_Base_URL}/nav-audit`);
            if (!response.ok) throw new Error("Failed to fetch NAV audit data");
            return await response.json();
        } catch (error) {
            console.error("Error fetching NAV audit:", error);
            return {};
        }
    });
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
        invalidateRequestCache('GET /nav-audit');
        invalidateRequestCache('POST /check-nav-lag');
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

            flatItems.push({
                ticker: t.ticker,
                weight: weight,  // Pass as percentage value (e.g., 10.00 for 10%)
                date: period.startDate,
                isMutualFund: t.isMutualFund || false,
                isEtf: t.isEtf || false,
                isCash: t.isCash || false,
            });
        });
    });
    return flatItems;
};

// =============================================================================
// Cache management
// =============================================================================

export const clearMarketCache = async (): Promise<void> => {
    await fetch(`${API_Base_URL}/cache/clear`, { method: 'POST' });
};
