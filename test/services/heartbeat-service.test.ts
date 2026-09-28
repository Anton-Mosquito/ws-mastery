import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { HeartbeatService } from "../../src/services/heartbeat-service.js";
import type { ClientMeta } from "../../src/types/index.js";

function createMeta(): ClientMeta {
  return {
    id: "client-1",
    username: "Anton",
    room: "general",
    isAlive: false,
    expiresAt: Date.now() + 60_000,
    lastActivity: Date.now(),
  };
}

function createSocket() {
  const sent: string[] = [];

  const socket = {
    readyState: WebSocket.OPEN,

    send(data: string) {
      sent.push(data);
    },
  } as unknown as WebSocket;

  return {
    socket,
    sent,
  };
}

describe("HeartbeatService", () => {
  it("responds to application ping", () => {
    const service = new HeartbeatService();
    const meta = createMeta();
    const { socket, sent } = createSocket();

    service.handlePing(socket, meta, 123);

    assert.equal(meta.isAlive, true);
    assert.deepEqual(sent, [
      JSON.stringify({
        type: "pong",
        sentAt: 123,
      }),
    ]);
  });

  it("uses current time when sentAt is missing", () => {
    const service = new HeartbeatService();
    const meta = createMeta();
    const { socket, sent } = createSocket();

    const before = Date.now();

    service.handlePing(socket, meta);

    const after = Date.now();

    assert.equal(meta.isAlive, true);
    assert.equal(sent.length, 1);

    const response = JSON.parse(sent[0]!);

    assert.equal(response.type, "pong");
    assert.equal(typeof response.sentAt, "number");
    assert.ok(response.sentAt >= before);
    assert.ok(response.sentAt <= after);
  });

  it("marks a client as alive", () => {
    const service = new HeartbeatService();
    const meta = createMeta();

    service.markAlive(meta);

    assert.equal(meta.isAlive, true);
  });

  it("marks a previously inactive client as alive", () => {
    const service = new HeartbeatService();
    const meta = createMeta();

    meta.isAlive = false;

    service.markAlive(meta);

    assert.equal(meta.isAlive, true);
  });
});
