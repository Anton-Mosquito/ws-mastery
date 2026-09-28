import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { WhisperService } from "../../src/services/whisper-service.js";
import type { ClientMeta, ClientsType } from "../../src/types/index.js";

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

  return {
    socket,
    sent,
  };
}

describe("WhisperService", () => {
  it("sends whisper to the recipient", () => {
    const clientsByUsername = new Map<string, WebSocket>();
    const clients: ClientsType = new Map();

    const sender = createSocket();
    const recipient = createSocket();

    clientsByUsername.set("Bob", recipient.socket);
    clients.set(sender.socket, createMeta("Anton"));
    clients.set(recipient.socket, createMeta("Bob"));

    const service = new WhisperService(clientsByUsername, clients);

    service.handle(sender.socket, "Anton", {
      recipientUsername: "Bob",
      text: "hello",
    });

    assert.equal(recipient.sent.length, 1);

    const message = JSON.parse(recipient.sent[0] as string);

    assert.equal(message.type, "whisper");
    assert.equal(message.from, "Anton");
    assert.equal(message.text, "hello");
    assert.equal(typeof message.timestamp, "number");

    assert.equal(sender.sent.length, 0);
  });

  it("sends an error when recipient does not exist", () => {
    const clientsByUsername = new Map<string, WebSocket>();
    const clients: ClientsType = new Map();

    const sender = createSocket();
    clients.set(sender.socket, createMeta("Anton"));

    const service = new WhisperService(clientsByUsername, clients);

    service.handle(sender.socket, "Anton", {
      recipientUsername: "Bob",
      text: "hello",
    });

    assert.deepEqual(sender.sent, [
      JSON.stringify({
        type: "error",
        message: 'Користувача "Bob" не знайдено',
      }),
    ]);
  });

  it("sends an error when recipient is not open", () => {
    const clientsByUsername = new Map<string, WebSocket>();
    const clients: ClientsType = new Map();

    const sender = createSocket();
    const recipient = createSocket();

    Object.assign(recipient.socket, {
      readyState: WebSocket.CLOSED,
    });

    clientsByUsername.set("Bob", recipient.socket);
    clients.set(sender.socket, createMeta("Anton"));
    clients.set(recipient.socket, createMeta("Bob"));

    const service = new WhisperService(clientsByUsername, clients);

    service.handle(sender.socket, "Anton", {
      recipientUsername: "Bob",
      text: "hello",
    });

    assert.deepEqual(sender.sent, [
      JSON.stringify({
        type: "error",
        message: 'Користувача "Bob" не знайдено',
      }),
    ]);
  });
});
