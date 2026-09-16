import { describe, expect, it, vi } from "vitest";
import { TtlCache, type CacheEntry, type CacheStore } from "../src/cache/ttl-cache.js";

describe("TTL cache", () => {
  it("coalesces concurrent loads for one upstream resource", async () => {
    const cache = new TtlCache();
    const load = vi.fn(async () => ({ rounds: 24 }));

    const [first, second] = await Promise.all([
      cache.getOrLoad("rounds", 1_000, load),
      cache.getOrLoad("rounds", 1_000, load),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ value: { rounds: 24 }, stale: false });
    expect(second).toEqual(first);
  });

  it("serves an expired valid value when reloading fails", async () => {
    let now = 0;
    const cache = new TtlCache(() => now);
    await cache.getOrLoad("standings", 10, async () => "current");
    now = 11;

    const result = await cache.getOrLoad("standings", 10, async () => {
      throw new Error("offline");
    });

    expect(result).toEqual({ value: "current", stale: true });
  });

  it("persists entries through a store across cache instances", async () => {
    const persisted = new Map<string, CacheEntry<unknown>>();
    const store: CacheStore = {
      get: (key) => persisted.get(key),
      set: (key, entry) => persisted.set(key, entry),
    };
    let now = 0;
    const first = new TtlCache(() => now, 100, store);
    await first.getOrLoad("games", 10, async () => ({ ok: true }));
    expect(persisted.get("games")).toEqual({ value: { ok: true }, expiresAt: 10 });

    now = 5;
    const second = new TtlCache(() => now, 100, store);
    const reload = vi.fn(async () => ({ ok: false }));
    const fresh = await second.getOrLoad("games", 10, reload);
    expect(reload).not.toHaveBeenCalled();
    expect(fresh).toEqual({ value: { ok: true }, stale: false });

    now = 20;
    const stale = await second.getOrLoad("games", 10, async () => {
      throw new Error("offline");
    });
    expect(stale).toEqual({ value: { ok: true }, stale: true });
  });
});
