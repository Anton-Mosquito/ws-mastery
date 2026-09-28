import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { ConnectionMonitor } from "../../src/services/connection-monitor.js";
import type { ClientMeta, ClientsType } from "../../src/types/index.js";

function createMeta(overrides: Partial<ClientMeta> = {}): ClientMeta {
  return {
    id: "client-1",
    username: "Anton",
    room: "general",
    isAlive: true,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    lastActivity: Date.now(),
    ...overrides,
  };
}

function createSocket(
  overrides: {
    readyState?: number;
    bufferedAmount?: number;
  } = {},
) {
  let terminated = false;
  let closed: { code: number; reason: string } | null = null;
  let pinged = false;

  const socket = {
    readyState: overrides.readyState ?? WebSocket.OPEN,
    bufferedAmount: overrides.bufferedAmount ?? 0,

    terminate() {
      terminated = true;
    },

    close(code: number, reason: string) {
      closed = { code, reason };
    },

    ping() {
      pinged = true;
    },
  } as unknown as WebSocket;

  return {
    socket,
    wasTerminated: () => terminated,
    getClosed: () => closed,
    wasPinged: () => pinged,
  };
}

function createPublisher() {
  const setexCalls: Array<{
    key: string;
    ttl: number;
    value: string;
  }> = [];

  return {
    setexCalls,

    async setex(key: string, ttl: number, value: string) {
      setexCalls.push({ key, ttl, value });
      return "OK";
    },
  };
}

async function runChecks(monitor: ConnectionMonitor) {
  const internals = monitor as unknown as {
    runChecks(): Promise<void>;
  };

  await internals.runChecks();
}

describe("ConnectionMonitor", () => {
  it("terminates a slow consumer", async () => {
    const clients: ClientsType = new Map();
    const publisher = createPublisher();
    const client = createSocket({
      bufferedAmount: 1_000_001,
    });

    clients.set(client.socket, createMeta());

    const monitor = new ConnectionMonitor(clients, publisher as never);

    await runChecks(monitor);

    assert.equal(client.wasTerminated(), true);
    assert.equal(client.wasPinged(), false);
    assert.equal(publisher.setexCalls.length, 0);
  });

  it("terminates a client that did not answer the heartbeat", async () => {
    const clients: ClientsType = new Map();
    const publisher = createPublisher();
    const client = createSocket();

    clients.set(
      client.socket,
      createMeta({
        isAlive: false,
      }),
    );

    const monitor = new ConnectionMonitor(clients, publisher as never);

    await runChecks(monitor);

    assert.equal(client.wasTerminated(), true);
    assert.equal(client.wasPinged(), false);
    assert.equal(publisher.setexCalls.length, 0);
  });

  it("closes a client with an expired JWT", async () => {
    const clients: ClientsType = new Map();
    const publisher = createPublisher();
    const client = createSocket();

    clients.set(
      client.socket,
      createMeta({
        expiresAt: Math.floor(Date.now() / 1000) - 1,
      }),
    );

    const monitor = new ConnectionMonitor(clients, publisher as never);

    await runChecks(monitor);

    assert.equal(client.wasTerminated(), false);
    assert.deepEqual(client.getClosed(), {
      code: 1008,
      reason: "Token expired",
    });
    assert.equal(client.wasPinged(), false);
    assert.equal(publisher.setexCalls.length, 0);
  });

  it("closes an idle client", async () => {
    const clients: ClientsType = new Map();
    const publisher = createPublisher();
    const client = createSocket();

    clients.set(
      client.socket,
      createMeta({
        lastActivity: Date.now() - 10 * 60_000 - 1,
      }),
    );

    const monitor = new ConnectionMonitor(clients, publisher as never);

    await runChecks(monitor);

    assert.equal(client.wasTerminated(), false);
    assert.deepEqual(client.getClosed(), {
      code: 1000,
      reason: "Idle timeout",
    });
    assert.equal(client.wasPinged(), false);
    assert.equal(publisher.setexCalls.length, 0);
  });

  it("pings a healthy client and updates Redis", async () => {
    const clients: ClientsType = new Map();
    const publisher = createPublisher();
    const client = createSocket();

    const meta = createMeta({
      isAlive: true,
    });

    clients.set(client.socket, meta);

    const monitor = new ConnectionMonitor(clients, publisher as never);

    await runChecks(monitor);

    assert.equal(publisher.setexCalls.length, 1);
    assert.equal(publisher.setexCalls[0]?.key, "user:Anton:alive");
    assert.equal(publisher.setexCalls[0]?.ttl, 60);
    assert.equal(typeof publisher.setexCalls[0]?.value, "string");
    assert.equal(publisher.setexCalls[0]?.value.length, 6);
  });
});
