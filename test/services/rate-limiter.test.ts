import test from "node:test";
import assert from "node:assert/strict";

import { RateLimiter } from "../../src/services/rate-limiter.js";

test("RateLimiter", async (t) => {
  await t.test("allows requests while tokens are available", () => {
    let now = 0;

    const limiter = new RateLimiter(2, 1, () => now);

    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), false);
  });

  await t.test("refills tokens over time", () => {
    let now = 0;

    const limiter = new RateLimiter(1, 1, () => now);

    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), false);

    now = 1000;

    assert.equal(limiter.tryConsume(), true);
  });

  await t.test("does not exceed capacity", () => {
    let now = 0;

    const limiter = new RateLimiter(2, 10, () => now);

    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), false);

    now = 1000;

    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), false);
  });

  await t.test("supports fractional token refill", () => {
    let now = 0;

    const limiter = new RateLimiter(1, 2, () => now);

    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), false);

    now = 250;

    assert.equal(limiter.tryConsume(), false);

    now = 500;

    assert.equal(limiter.tryConsume(), true);
  });

  await t.test("uses current time from the injected clock", () => {
    let now = 5000;

    const limiter = new RateLimiter(1, 1, () => now);

    assert.equal(limiter.tryConsume(), true);
    assert.equal(limiter.tryConsume(), false);

    now += 1000;

    assert.equal(limiter.tryConsume(), true);
  });
});
