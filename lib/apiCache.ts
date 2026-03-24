/**
 * Lightweight in-memory cache for server-side API route handlers.
 * Avoids hitting Meta Graph API on every request within the TTL window.
 *
 * Module-level Map persists across requests in the same Node.js process
 * (Next.js keeps route modules alive between requests in production).
 */

const MAX_ENTRIES = 200;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, CacheEntry<any>>();

/** In-flight promises for deduplication of concurrent requests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inflight = new Map<string, Promise<any>>();

/** Evict expired entries and, if still over limit, oldest entries first. */
function evict(): void {
  const now = Date.now();
  // First pass: remove expired
  for (const [key, entry] of store) {
    if (now >= entry.expiresAt) store.delete(key);
  }
  // Second pass: if still over limit, remove oldest (first inserted — Map is ordered)
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    let removed = 0;
    for (const key of store.keys()) {
      if (removed >= excess) break;
      store.delete(key);
      removed++;
    }
  }
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) evict();
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Return cached value, or compute+store it.
 * Concurrent calls with the same key share a single in-flight Promise
 * to avoid duplicate Meta API calls and rate-limit pressure.
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  // Deduplicate concurrent requests for the same key
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().then((fresh) => {
    setCached(key, fresh, ttlMs);
    inflight.delete(key);
    return fresh;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}
