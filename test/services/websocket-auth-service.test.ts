import test from "node:test";
import assert from "node:assert/strict";
import { WebSocketAuthService } from "../../src/services/websocket-auth-service.js";

function createRequest(
  origin: string | undefined,
  url = "/?token=valid-token",
) {
  return {
    headers: {
      origin,
      host: "localhost:8080",
    },
    url,
  } as any;
}

test("WebSocketAuthService", async (t) => {
  await t.test("accepts valid origin and token", () => {
    const payload = {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    };

    const service = new WebSocketAuthService(
      () => payload,
      ["http://localhost:3000"],
    );

    const result = service.authenticate(createRequest("http://localhost:3000"));

    assert.deepEqual(result, {
      success: true,
      payload,
    });
  });

  await t.test("rejects missing origin", () => {
    const service = new WebSocketAuthService(
      () => ({ userId: "1", username: "Anton", exp: 1 }),
      ["http://localhost:3000"],
    );

    const result = service.authenticate(createRequest(undefined));

    assert.deepEqual(result, {
      success: false,
      statusCode: 403,
      reason: "відхилений Origin: відсутній",
    });
  });

  await t.test("rejects forbidden origin", () => {
    const service = new WebSocketAuthService(
      () => ({ userId: "1", username: "Anton", exp: 1 }),
      ["http://localhost:3000"],
    );

    const result = service.authenticate(createRequest("http://evil.example"));

    assert.deepEqual(result, {
      success: false,
      statusCode: 403,
      reason: "відхилений Origin: http://evil.example",
    });
  });

  await t.test("rejects missing token", () => {
    const service = new WebSocketAuthService(
      () => ({ userId: "1", username: "Anton", exp: 1 }),
      ["http://localhost:3000"],
    );

    const result = service.authenticate(
      createRequest("http://localhost:3000", "/"),
    );

    assert.deepEqual(result, {
      success: false,
      statusCode: 401,
      reason: "відсутній токен",
    });
  });

  await t.test("rejects invalid token", () => {
    const service = new WebSocketAuthService(() => {
      throw new Error("invalid token");
    }, ["http://localhost:3000"]);

    const result = service.authenticate(createRequest("http://localhost:3000"));

    assert.deepEqual(result, {
      success: false,
      statusCode: 401,
      reason: "невалідний або прострочений токен",
    });
  });
});
