/** Lightweight in-memory TTL cache for API response objects. */
interface RCEntry { data: unknown; exp: number }
const _rc = new Map<string, RCEntry>();

export function rcGet<T>(key: string): T | null {
  const e = _rc.get(key);
  if (!e || Date.now() > e.exp) { _rc.delete(key); return null; }
  return e.data as T;
}

export function rcSet<T>(key: string, data: T, ttlMs: number): void {
  _rc.set(key, { data, exp: Date.now() + ttlMs });
}

export function rcDel(prefix: string): void {
  for (const k of _rc.keys()) if (k.startsWith(prefix)) _rc.delete(k);
}
