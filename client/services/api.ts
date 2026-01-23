import { PortfolioItem } from '../types';

const API_Base_URL = ''; // Use relative path to leverage Vite proxy


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

// Cache storage - Initialize from localStorage if available
let sectorCache: Record<string, string> = {};
try {
    const cached = localStorage.getItem('sectorCache');
    if (cached) {
        sectorCache = JSON.parse(cached);
    }
} catch (e) {
    console.warn("Failed to load sector cache from localStorage", e);
}

let indexExposureCache: { sectors: any[], geography: any[] } | null = null;

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
                // Persist to localStorage
                try {
                    localStorage.setItem('sectorCache', JSON.stringify(sectorCache));
                } catch (e) {
                    console.warn("Failed to save sector cache to localStorage", e);
                }
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

// Beta cache - Initialize from localStorage if available
let betaCache: Record<string, number> = {};
try {
    const cached = localStorage.getItem('betaCache');
    if (cached) {
        betaCache = JSON.parse(cached);
    }
} catch (e) {
    console.warn("Failed to load beta cache from localStorage", e);
}

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
                // Persist to localStorage
                try {
                    localStorage.setItem('betaCache', JSON.stringify(betaCache));
                } catch (e) {
                    console.warn("Failed to save beta cache to localStorage", e);
                }
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

// Dividend yield cache - Initialize from localStorage if available
// Version 3: Fixed - yfinance returns dividendYield as percentage, not decimal
const DIVIDEND_CACHE_VERSION = 4;
let dividendCache: Record<string, number> = {};
try {
    const cachedVersion = localStorage.getItem('dividendCacheVersion');
    const currentVersion = String(DIVIDEND_CACHE_VERSION);

    if (cachedVersion === currentVersion) {
        const cached = localStorage.getItem('dividendCache');
        if (cached) {
            dividendCache = JSON.parse(cached);
        }
    } else {
        // Cache version mismatch - clear old cache
        localStorage.removeItem('dividendCache');
        localStorage.setItem('dividendCacheVersion', currentVersion);

    }
} catch (e) {
    console.warn("Failed to load dividend cache from localStorage", e);
}

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
                // Persist to localStorage
                try {
                    localStorage.setItem('dividendCache', JSON.stringify(dividendCache));
                } catch (e) {
                    console.warn("Failed to save dividend cache to localStorage", e);
                }
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
                });
            }
        });
    });
    return flatItems;
};

