import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getClientIp } from "../../src/utils/get-client-ip.js";

describe("getClientIp", () => {
  it("returns the request remote address", () => {
    const request = {
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as import("http").IncomingMessage;

    assert.equal(getClientIp(request), "127.0.0.1");
  });

  it('returns "unknown" when remote address is missing', () => {
    const request = {
      socket: {
        remoteAddress: undefined,
      },
    } as import("http").IncomingMessage;

    assert.equal(getClientIp(request), "unknown");
  });
});
