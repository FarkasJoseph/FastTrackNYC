type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = "v7";

const globalCacheStore = globalThis as typeof globalThis & {
  __fastTrackServerCache?: Map<string, CacheEntry<unknown>>;
};

function getCacheStore() {
  if (!globalCacheStore.__fastTrackServerCache) {
    globalCacheStore.__fastTrackServerCache = new Map();
  }

  return globalCacheStore.__fastTrackServerCache;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export async function withServerCache<T>(
  namespace: string,
  key: string,
  load: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const store = getCacheStore();
  const cacheKey = `${CACHE_VERSION}:${namespace}:${key}`;
  const now = Date.now();
  const cached = store.get(cacheKey) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await load();

  store.set(cacheKey, {
    value,
    expiresAt: now + ttlMs,
  });

  if (store.size > 500) {
    for (const [entryKey, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(entryKey);
      }
    }
  }

  return value;
}
