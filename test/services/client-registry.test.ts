import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { ClientRegistry } from "../../src/services/client-registry.js";
import type { ClientsType } from "../../src/types/index.js";

function createSocket() {
  return {
    readyState: WebSocket.OPEN,
  } as WebSocket;
}

describe("ClientRegistry", () => {
  it("creates and registers client metadata", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const socket = createSocket();

    const meta = registry.register(socket, {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    assert.equal(meta.username, "Anton");
    assert.equal(meta.room, "lobby");
    assert.equal(meta.isAlive, true);
    assert.equal(meta.expiresAt, 1234567890);
    assert.equal(typeof meta.id, "string");
    assert.equal(meta.id.length, 8);
    assert.equal(typeof meta.lastActivity, "number");

    assert.equal(clients.get(socket), meta);
    assert.equal(clientsByUsername.get("Anton"), socket);
  });

  it("uses username from token as the registry key", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const socket = createSocket();

    registry.register(socket, {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    assert.equal(clientsByUsername.has("Anton"), true);
    assert.equal(clientsByUsername.has("user-1"), false);
  });

  it("creates different client ids for different registrations", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const firstSocket = createSocket();
    const secondSocket = createSocket();

    const first = registry.register(firstSocket, {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    const second = registry.register(secondSocket, {
      userId: "user-2",
      username: "Bob",
      exp: 1234567890,
    });

    assert.notEqual(first.id, second.id);
    assert.equal(clients.size, 2);
    assert.equal(clientsByUsername.size, 2);
  });

  it("sets lastActivity during registration", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const before = Date.now();

    const meta = registry.register(createSocket(), {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    const after = Date.now();

    assert.ok(meta.lastActivity >= before);
    assert.ok(meta.lastActivity <= after);
  });

  it("unregisters a client", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const socket = createSocket();

    registry.register(socket, {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    const meta = registry.unregister(socket);

    assert.equal(meta?.username, "Anton");
    assert.equal(clients.has(socket), false);
    assert.equal(clientsByUsername.has("Anton"), false);
  });

  it("returns undefined when unregistering an unknown client", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const socket = createSocket();

    assert.equal(registry.unregister(socket), undefined);
  });

  it("removes the client from both registries", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const socket = createSocket();

    registry.register(socket, {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    registry.unregister(socket);

    assert.equal(clients.size, 0);
    assert.equal(clientsByUsername.size, 0);
  });

  it("returns registered client metadata", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    const socket = createSocket();

    const registered = registry.register(socket, {
      userId: "user-1",
      username: "Anton",
      exp: 1234567890,
    });

    assert.equal(registry.get(socket), registered);
  });

  it("returns undefined for an unknown client", () => {
    const clients: ClientsType = new Map();
    const clientsByUsername = new Map<string, WebSocket>();

    const registry = new ClientRegistry(clients, clientsByUsername);

    assert.equal(registry.get(createSocket()), undefined);
  });
});
