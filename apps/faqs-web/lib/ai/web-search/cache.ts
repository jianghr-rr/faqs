import NodeCache from 'node-cache';

const globalForTavilyCache = globalThis as unknown as {
    tavilyCache?: NodeCache;
};

export function getTavilyCache(ttlSeconds: number) {
    if (!globalForTavilyCache.tavilyCache) {
        globalForTavilyCache.tavilyCache = new NodeCache({
            stdTTL: ttlSeconds,
            checkperiod: Math.max(Math.floor(ttlSeconds / 2), 60),
            useClones: false,
        });
    }

    return globalForTavilyCache.tavilyCache;
}
