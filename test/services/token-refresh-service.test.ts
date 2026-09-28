import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TokenRefreshService } from "../../src/services/token-refresh-service.js";
import type { TokenPayload } from "../../src/types/index.js";

function createPayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    userId: "user-1",
    username: "Anton",
    exp: 1234567890,
    ...overrides,
  };
}

describe("TokenRefreshService", () => {
  it("returns refreshed payload for valid matching token", () => {
    const refreshedPayload = createPayload({
      exp: 1234567999,
    });

    const service = new TokenRefreshService(() => refreshedPayload);

    const result = service.refresh(createPayload(), "Anton", "valid-token");

    assert.deepEqual(result, {
      success: true,
      payload: refreshedPayload,
    });
  });

  it("rejects token with different userId", () => {
    const service = new TokenRefreshService(() =>
      createPayload({
        userId: "user-2",
      }),
    );

    const result = service.refresh(createPayload(), "Anton", "token");

    assert.deepEqual(result, {
      success: false,
      reason: "identity_mismatch",
    });
  });

  it("rejects token with different username", () => {
    const service = new TokenRefreshService(() =>
      createPayload({
        username: "Bob",
      }),
    );

    const result = service.refresh(createPayload(), "Anton", "token");

    assert.deepEqual(result, {
      success: false,
      reason: "identity_mismatch",
    });
  });

  it("handles invalid token", () => {
    const service = new TokenRefreshService(() => {
      throw new Error("Invalid token");
    });

    const result = service.refresh(createPayload(), "Anton", "invalid-token");

    assert.deepEqual(result, {
      success: false,
      reason: "invalid_token",
    });
  });
});
