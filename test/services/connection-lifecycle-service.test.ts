import test from "node:test";
import assert from "node:assert/strict";
import { ConnectionLifecycleService } from "../../src/services/connection-lifecycle-service.js";
import type { ClientMeta } from "../../src/types/index.js";
import type { WebSocket } from "ws";

function createMeta(): ClientMeta {
  return {
    id: "client-1",
    username: "Anton",
    room: "lobby",
    isAlive: false,
    expiresAt: 9999999999,
    lastActivity: Date.now(),
  };
}

test("ConnectionLifecycleService", async (t) => {
  await t.test("handles close by delegating cleanup", async () => {
    const cleanupCalls: Array<{
      socket: WebSocket;
      clientIp: string;
    }> = [];

    const socket = {} as WebSocket;

    const cleanupService = {
      async cleanup(socket: WebSocket, clientIp: string) {
        cleanupCalls.push({ socket, clientIp });
      },
    };

    const heartbeatService = {
      markAlive() {},
    };

    const service = new ConnectionLifecycleService(
      cleanupService,
      heartbeatService,
    );

    service.handleClose(socket, "127.0.0.1");

    await Promise.resolve();

    assert.deepEqual(cleanupCalls, [
      {
        socket,
        clientIp: "127.0.0.1",
      },
    ]);
  });

  await t.test("handles pong by marking client alive", () => {
    const meta = createMeta();
    const marked: ClientMeta[] = [];

    const cleanupService = {
      async cleanup() {},
    };

    const heartbeatService = {
      markAlive(meta: ClientMeta) {
        marked.push(meta);
      },
    };

    const service = new ConnectionLifecycleService(
      cleanupService,
      heartbeatService,
    );

    service.handlePong(meta);

    assert.deepEqual(marked, [meta]);
  });

  await t.test("does not throw when cleanup rejects", async () => {
    const socket = {} as WebSocket;

    const cleanupService = {
      async cleanup() {
        throw new Error("cleanup failed");
      },
    };

    const heartbeatService = {
      markAlive() {},
    };

    const service = new ConnectionLifecycleService(
      cleanupService,
      heartbeatService,
    );

    assert.doesNotThrow(() => {
      service.handleClose(socket, "127.0.0.1");
    });

    await new Promise((resolve) => setImmediate(resolve));
  });
});
