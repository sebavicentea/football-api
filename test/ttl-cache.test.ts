import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "../src/cache/ttl-cache.js";

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
});
