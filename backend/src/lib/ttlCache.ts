/**
 * A small in-memory cache for data that many people read at once and that may be a few seconds
 * old (a public poll's live results, a published form). Concurrent misses share one load instead of
 * each hitting the database (no stampede), the number of entries is capped, and a failed load is
 * never cached. Each server instance has its own copy, so the worst staleness is the TTL.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value?: T; expires: number; loading?: Promise<T> }>();

  constructor(private readonly maxEntries = 500) {}

  async get(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit?.loading) return hit.loading;
    if (hit && hit.value !== undefined && hit.expires > now) return hit.value;

    const loading = load().then(
      (value) => {
        this.entries.set(key, { value, expires: Date.now() + ttlMs });
        return value;
      },
      (err) => {
        this.entries.delete(key);
        throw err;
      },
    );
    this.entries.set(key, { value: hit?.value, expires: 0, loading });
    this.evict();
    return loading;
  }

  invalidate(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }

  private evict() {
    if (this.entries.size <= this.maxEntries) return;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (!entry.loading && entry.expires <= now) this.entries.delete(key);
      if (this.entries.size <= this.maxEntries) return;
    }
    // Still too many: drop the oldest inserted ones that aren't loading.
    for (const [key, entry] of this.entries) {
      if (!entry.loading) this.entries.delete(key);
      if (this.entries.size <= this.maxEntries) return;
    }
  }
}
