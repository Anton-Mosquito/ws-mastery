import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { localBroadcast } from "../../src/utils/local-broadcast.js";
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

function createSocket(readyState: number, bufferedAmount = 0) {
  const sent: unknown[] = [];
  let terminated = false;

  const socket = {
    readyState,
    bufferedAmount,
    send(data: unknown) {
      sent.push(data);
    },
    terminate() {
      terminated = true;
    },
  } as unknown as WebSocket;

  return {
    socket,
    sent,
    wasTerminated: () => terminated,
  };
}

describe("localBroadcast", () => {
  it("does nothing when room does not exist", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();
    const { socket, sent } = createSocket(WebSocket.OPEN);

    localBroadcast(
      rooms,
      "general",
      { type: "system", text: "hello" },
      clients,
    );

    assert.equal(sent.length, 0);
    assert.equal(clients.has(socket), false);
  });

  it("broadcasts JSON message to open clients", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const first = createSocket(WebSocket.OPEN);
    const second = createSocket(WebSocket.OPEN);

    rooms.set("general", new Set([first.socket, second.socket]));
    clients.set(first.socket, createMeta("Anton"));
    clients.set(second.socket, createMeta("Bob"));

    const message = {
      type: "system" as const,
      text: "hello",
    };

    localBroadcast(rooms, "general", message, clients);

    assert.deepEqual(first.sent, [JSON.stringify(message)]);
    assert.deepEqual(second.sent, [JSON.stringify(message)]);
  });

  it("skips closed clients", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const openClient = createSocket(WebSocket.OPEN);
    const closedClient = createSocket(WebSocket.CLOSED);

    rooms.set("general", new Set([openClient.socket, closedClient.socket]));

    clients.set(openClient.socket, createMeta("Anton"));
    clients.set(closedClient.socket, createMeta("Bob"));

    localBroadcast(
      rooms,
      "general",
      { type: "system", text: "hello" },
      clients,
    );

    assert.equal(openClient.sent.length, 1);
    assert.equal(closedClient.sent.length, 0);
  });

  it("excludes the specified socket", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const sender = createSocket(WebSocket.OPEN);
    const recipient = createSocket(WebSocket.OPEN);

    rooms.set("general", new Set([sender.socket, recipient.socket]));

    clients.set(sender.socket, createMeta("Anton"));
    clients.set(recipient.socket, createMeta("Bob"));

    localBroadcast(
      rooms,
      "general",
      { type: "system", text: "hello" },
      clients,
      sender.socket,
    );

    assert.equal(sender.sent.length, 0);
    assert.equal(recipient.sent.length, 1);
  });

  it("sends string and Buffer without JSON serialization", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const client = createSocket(WebSocket.OPEN);

    rooms.set("general", new Set([client.socket]));
    clients.set(client.socket, createMeta("Anton"));

    const buffer = Buffer.from("hello");

    localBroadcast(rooms, "general", buffer, clients);

    assert.equal(client.sent.length, 1);
    assert.equal(client.sent[0], buffer);
  });

  it("terminates a slow consumer", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const client = createSocket(WebSocket.OPEN, 1_000_001);

    rooms.set("general", new Set([client.socket]));
    clients.set(client.socket, createMeta("Anton"));

    localBroadcast(
      rooms,
      "general",
      { type: "system", text: "hello" },
      clients,
    );

    assert.equal(client.wasTerminated(), true);
    assert.equal(client.sent.length, 0);
  });
});
