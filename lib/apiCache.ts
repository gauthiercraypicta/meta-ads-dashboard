/**
 * Lightweight in-memory cache for server-side API route handlers.
 * Avoids hitting Meta Graph API on every request within the TTL window.
 *
 * Module-level Map persists across requests in the same Node.js process
 * (Next.js keeps route modules alive between requests in production).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, CacheEntry<any>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Convenience: return cached value or compute+store it */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;
  const fresh = await fn();
  setCached(key, fresh, ttlMs);
  return fresh;
}
