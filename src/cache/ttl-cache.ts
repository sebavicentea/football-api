interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CachedResult<T> {
  value: T;
  stale: boolean;
}

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 100,
  ) {}

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<CachedResult<T>> {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (entry && entry.expiresAt > this.now()) return { value: entry.value, stale: false };

    try {
      const value = await this.singleFlight(key, load);
      this.set(key, { value, expiresAt: this.now() + ttlMs });
      return { value, stale: false };
    } catch (error) {
      if (entry) return { value: entry.value, stale: true };
      throw error;
    }
  }

  private set<T>(key: string, entry: CacheEntry<T>): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, entry);
  }

  private async singleFlight<T>(key: string, load: () => Promise<T>): Promise<T> {
    const active = this.pending.get(key) as Promise<T> | undefined;
    if (active) return active;

    const pending = load().finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
    return pending;
  }
}
