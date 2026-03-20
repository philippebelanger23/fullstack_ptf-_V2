// Maps backend country names → TopoJSON properties.name in world-110m.json
// Used to match geography data to map features
export const backendToTopoName: Record<string, string> = {
    'United States': 'United States of America',
    'Korea (South)': 'South Korea',
    'Czech Republic': 'Czechia',
    'Russian Federation': 'Russia',
    // These match exactly in both datasets:
    // Australia, Austria, Belgium, Brazil, Canada, Chile, China, Colombia,
    // Denmark, Egypt, Finland, France, Germany, Greece, Hungary, India,
    // Indonesia, Ireland, Israel, Italy, Japan, Kuwait, Malaysia, Mexico,
    // Netherlands, New Zealand, Norway, Peru, Philippines, Poland, Portugal,
    // Qatar, Saudi Arabia, Singapore, South Africa, Spain, Sweden,
    // Switzerland, Taiwan, Thailand, Turkey, United Arab Emirates, United Kingdom
};

// Reverse lookup: TopoJSON name → backend name
export const topoToBackendName: Record<string, string> = Object.fromEntries(
    Object.entries(backendToTopoName).map(([k, v]) => [v, k])
);

export const developedMarkets = [
    'United Kingdom', 'Japan', 'France', 'Switzerland', 'Germany', 'Australia', 'Netherlands',
    'Sweden', 'Denmark', 'Italy', 'Spain', 'Hong Kong', 'Singapore', 'Finland', 'Belgium',
    'Norway', 'Ireland', 'Israel', 'New Zealand', 'Austria', 'Portugal'
];

export const emergingMarkets = [
    'China', 'Taiwan', 'India', 'Korea (South)', 'South Korea', 'Brazil', 'Saudi Arabia',
    'South Africa', 'Mexico', 'Thailand', 'Indonesia', 'Malaysia', 'Turkey', 'Philippines',
    'Poland', 'Chile', 'Greece', 'Peru', 'Hungary', 'Czech Republic', 'Egypt', 'Colombia',
    'Kuwait', 'Qatar', 'United Arab Emirates', 'Russian Federation'
];

export function getMarketType(region: string): 'US' | 'Canada' | 'DM' | 'EM' | 'Other' {
    if (region === 'United States') return 'US';
    if (region === 'Canada') return 'Canada';
    if (developedMarkets.includes(region)) return 'DM';
    if (emergingMarkets.includes(region)) return 'EM';
    return 'Other';
}
