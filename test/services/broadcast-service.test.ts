import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { BroadcastService } from "../../src/services/broadcast-service.js";
import type {
  ClientMeta,
  ClientsType,
  RoomsType,
} from "../../src/types/index.js";

function createMeta(username: string): ClientMeta {
  return {
    id: username,
    username,
    room: "general",
    isAlive: true,
    expiresAt: Date.now() + 60_000,
    lastActivity: Date.now(),
  };
}

function createSocket() {
  const sent: unknown[] = [];

  const socket = {
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(data: unknown) {
      sent.push(data);
    },
    terminate() {},
  } as unknown as WebSocket;

  return { socket, sent };
}

function createPublisher() {
  const published: Array<{
    channel: string;
    message: string;
  }> = [];

  return {
    published,

    async publish(channel: string, message: string) {
      published.push({ channel, message });
      return 1;
    },
  };
}

describe("BroadcastService", () => {
  it("broadcasts JSON data locally and publishes it to Redis", async () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();
    const publisher = createPublisher();

    const client = createSocket();

    rooms.set("general", new Set([client.socket]));
    clients.set(client.socket, createMeta("Anton"));

    const service = new BroadcastService(
      rooms,
      clients,
      publisher,
      "test-instance",
    );

    const message = {
      type: "system" as const,
      text: "hello",
    };

    service.broadcast("general", message);

    assert.deepEqual(client.sent, [JSON.stringify(message)]);

    assert.equal(publisher.published.length, 1);
    assert.equal(publisher.published[0]?.channel, "ws:broadcast");

    const redisMessage = JSON.parse(publisher.published[0]!.message);

    assert.deepEqual(redisMessage, {
      instanceId: "test-instance",
      kind: "json",
      room: "general",
      message,
    });
  });

  it("broadcasts binary data locally and publishes base64 payload to Redis", async () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();
    const publisher = createPublisher();

    const client = createSocket();

    rooms.set("general", new Set([client.socket]));
    clients.set(client.socket, createMeta("Anton"));

    const service = new BroadcastService(
      rooms,
      clients,
      publisher,
      "test-instance",
    );

    const buffer = Buffer.from("hello");

    service.broadcast("general", buffer);

    assert.deepEqual(client.sent, [buffer]);

    assert.equal(publisher.published.length, 1);

    const redisMessage = JSON.parse(publisher.published[0]!.message);

    assert.deepEqual(redisMessage, {
      instanceId: "test-instance",
      kind: "binary",
      room: "general",
      payload: buffer.toString("base64"),
    });
  });

  it("passes excludeSocket to local broadcast", async () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();
    const publisher = createPublisher();

    const sender = createSocket();
    const recipient = createSocket();

    rooms.set("general", new Set([sender.socket, recipient.socket]));

    clients.set(sender.socket, createMeta("Anton"));
    clients.set(recipient.socket, createMeta("Bob"));

    const service = new BroadcastService(
      rooms,
      clients,
      publisher,
      "test-instance",
    );

    const message = {
      type: "system" as const,
      text: "hello",
    };

    service.broadcast("general", message, sender.socket);

    assert.equal(sender.sent.length, 0);
    assert.deepEqual(recipient.sent, [JSON.stringify(message)]);
    assert.equal(publisher.published.length, 1);
  });
});
