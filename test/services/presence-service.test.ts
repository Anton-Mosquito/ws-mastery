import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PresenceService } from "../../src/services/presence-service.js";

function createPublisher() {
  const calls: Array<{
    method: string;
    key: string;
    member?: string;
  }> = [];

  return {
    calls,

    async sadd(key: string, member: string) {
      calls.push({ method: "sadd", key, member });
      return 1;
    },

    async srem(key: string, member: string) {
      calls.push({ method: "srem", key, member });
      return 1;
    },

    async smembers(key: string) {
      calls.push({ method: "smembers", key });
      return ["Anton", "Bob"];
    },
  };
}

describe("PresenceService", () => {
  it("adds a user to a room", async () => {
    const publisher = createPublisher();
    const service = new PresenceService(publisher);

    const result = await service.addUser("general", "Anton");

    assert.equal(result, 1);
    assert.deepEqual(publisher.calls, [
      {
        method: "sadd",
        key: "room:general:users",
        member: "Anton",
      },
    ]);
  });

  it("removes a user from a room", async () => {
    const publisher = createPublisher();
    const service = new PresenceService(publisher);

    const result = await service.removeUser("general", "Anton");

    assert.equal(result, 1);
    assert.deepEqual(publisher.calls, [
      {
        method: "srem",
        key: "room:general:users",
        member: "Anton",
      },
    ]);
  });

  it("returns users in a room", async () => {
    const publisher = createPublisher();
    const service = new PresenceService(publisher);

    const users = await service.getUsers("general");

    assert.deepEqual(users, ["Anton", "Bob"]);
    assert.deepEqual(publisher.calls, [
      {
        method: "smembers",
        key: "room:general:users",
      },
    ]);
  });
});
