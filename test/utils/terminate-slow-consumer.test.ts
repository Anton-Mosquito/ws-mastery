import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { terminateSlowConsumer } from "../../src/utils/terminate-slow-consumer.js";
import type { ClientMeta, ClientsType } from "../../src/types/index.js";

function createMeta(): ClientMeta {
  return {
    id: "client-1",
    username: "Anton",
    room: "general",
    isAlive: true,
    expiresAt: Date.now() + 60_000,
    lastActivity: Date.now(),
  };
}

function createSocket(readyState: number) {
  let terminated = false;

  const socket = {
    readyState,
    bufferedAmount: 10_000,
    terminate() {
      terminated = true;
    },
  } as unknown as WebSocket;

  return {
    socket,
    wasTerminated: () => terminated,
  };
}

describe("terminateSlowConsumer", () => {
  it("does nothing when client metadata is missing", () => {
    const clients: ClientsType = new Map();
    const { socket, wasTerminated } = createSocket(WebSocket.OPEN);

    terminateSlowConsumer(clients, socket);

    assert.equal(wasTerminated(), false);
  });

  it("does nothing when socket is not open", () => {
    const clients: ClientsType = new Map();
    const { socket, wasTerminated } = createSocket(WebSocket.CLOSED);

    clients.set(socket, createMeta());

    terminateSlowConsumer(clients, socket);

    assert.equal(wasTerminated(), false);
  });

  it("terminates an open slow consumer", () => {
    const clients: ClientsType = new Map();
    const { socket, wasTerminated } = createSocket(WebSocket.OPEN);

    clients.set(socket, createMeta());

    terminateSlowConsumer(clients, socket);

    assert.equal(wasTerminated(), true);
  });
});
