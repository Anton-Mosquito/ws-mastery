import test from "node:test";
import assert from "node:assert/strict";
import { LoginService } from "../../src/services/login-service.js";

test("LoginService", async (t) => {
  await t.test("creates token for provided username and userId", () => {
    const getTokenCalls: Array<{
      username: string;
      userId: string;
    }> = [];

    const service = new LoginService((username, userId) => {
      getTokenCalls.push({ username, userId });
      return "token-123";
    });

    const result = service.login(" Anton ", " user-1 ");

    assert.deepEqual(result, {
      token: "token-123",
      expiresIn: "1h",
      userId: "user-1",
      username: "Anton",
    });

    assert.deepEqual(getTokenCalls, [
      {
        username: "Anton",
        userId: "user-1",
      },
    ]);
  });

  await t.test("generates guest username when username is missing", () => {
    const service = new LoginService((username, userId) => {
      return `${username}:${userId}`;
    });

    const result = service.login(undefined, "user-1");

    assert.match(result.username, /^Гість-\w{4}$/);
    assert.equal(result.userId, "user-1");
    assert.equal(result.token, `${result.username}:user-1`);
  });

  await t.test("generates userId when userId is missing", () => {
    const service = new LoginService((username, userId) => {
      return `${username}:${userId}`;
    });

    const result = service.login("Anton", undefined);

    assert.equal(result.username, "Anton");
    assert.match(result.userId, /^[A-Za-z0-9_-]{8}$/);
    assert.equal(result.token, `Anton:${result.userId}`);
  });

  await t.test("generates both values when both are missing", () => {
    const service = new LoginService((username, userId) => {
      return `${username}:${userId}`;
    });

    const result = service.login();

    assert.match(result.username, /^Гість-[A-Za-z0-9_-]{4}$/);
    assert.match(result.userId, /^[A-Za-z0-9_-]{8}$/);
    assert.equal(result.token, `${result.username}:${result.userId}`);
  });
});
