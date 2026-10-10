import { describe, expect, it } from "vitest";
import { createLimiter } from "../../src/lib/limiter.js";
import { TtlCache } from "../../src/lib/ttlCache.js";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "../../src/lib/loginThrottle.js";
import { canonicalEmail } from "../../src/lib/emailKey.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("TtlCache", () => {
  it("shares one load between concurrent requests (no stampede)", async () => {
    const cache = new TtlCache<number>();
    let loads = 0;
    const load = async () => {
      loads++;
      await sleep(30);
      return 42;
    };
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.get("k", 1000, load)));
    expect(results.every((r) => r === 42)).toBe(true);
    expect(loads).toBe(1);
  });

  it("serves from cache until the TTL passes, then reloads", async () => {
    const cache = new TtlCache<number>();
    let loads = 0;
    const load = async () => ++loads;
    expect(await cache.get("k", 40, load)).toBe(1);
    expect(await cache.get("k", 40, load)).toBe(1);
    await sleep(60);
    expect(await cache.get("k", 40, load)).toBe(2);
  });

  it("never caches a failed load", async () => {
    const cache = new TtlCache<number>();
    await expect(cache.get("k", 1000, async () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    expect(await cache.get("k", 1000, async () => 7)).toBe(7);
  });

  it("keeps the number of entries bounded", async () => {
    const cache = new TtlCache<number>(20);
    for (let i = 0; i < 200; i++) await cache.get(`k${i}`, 1, async () => i);
    await sleep(5);
    await cache.get("last", 1, async () => 1);
    expect(cache.size).toBeLessThanOrEqual(21);
  });
});

describe("createLimiter", () => {
  it("never runs more than the limit at once", async () => {
    const run = createLimiter(3);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        run(async () => {
          active++;
          peak = Math.max(peak, active);
          await sleep(10);
          active--;
        }),
      ),
    );
    expect(peak).toBe(3);
  });

  it("refuses work when the queue is full instead of piling up", async () => {
    const run = createLimiter(1, 2);
    const slow = run(() => sleep(50));
    const queued = [run(() => sleep(1)), run(() => sleep(1))];
    await expect(run(async () => 1)).rejects.toThrow(/busy/i);
    await Promise.all([slow, ...queued]);
  });

  it("keeps working after a job fails", async () => {
    const run = createLimiter(1);
    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await run(async () => "ok")).toBe("ok");
  });
});

describe("login throttle", () => {
  it("pauses sign-in for an account after repeated failures, and a success resets it", () => {
    const email = `victim-${Math.random()}@example.com`;
    for (let i = 0; i < 7; i++) recordLoginFailure(email);
    expect(() => assertLoginAllowed(email)).not.toThrow();
    recordLoginFailure(email);
    expect(() => assertLoginAllowed(email)).toThrow(/Too many failed/);
    // The same account written differently is still the same account.
    expect(() => assertLoginAllowed(email.toUpperCase())).toThrow();
    clearLoginFailures(email);
    expect(() => assertLoginAllowed(email)).not.toThrow();
  });
});

describe("canonicalEmail (one vote or place per person)", () => {
  it("treats plus-tags and Gmail dots as the same person", () => {
    expect(canonicalEmail("A.B+vote2@Gmail.com")).toBe("ab@gmail.com");
    expect(canonicalEmail("ab@googlemail.com")).toBe("ab@gmail.com");
  });
  it("keeps dots for other providers but still drops plus-tags", () => {
    expect(canonicalEmail("first.last+x@school.edu")).toBe("first.last@school.edu");
  });
});
