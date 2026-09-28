import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { RoomManager } from "../../src/services/room-manager.js";
import type {
  ClientMeta,
  ClientsType,
  RoomsType,
} from "../../src/types/index.js";

function createMeta(room = "lobby"): ClientMeta {
  return {
    id: "client-1",
    username: "Anton",
    room,
    isAlive: true,
    expiresAt: Date.now() + 60_000,
    lastActivity: Date.now(),
  };
}

function createSocket() {
  return {
    readyState: WebSocket.OPEN,
  } as WebSocket;
}

describe("RoomManager", () => {
  it("joins a new room and returns the previous room", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const socket = createSocket();

    clients.set(socket, createMeta("lobby"));
    rooms.set("lobby", new Set([socket]));

    const manager = new RoomManager(rooms, clients);

    const previousRoom = manager.join(socket, "general");

    assert.equal(previousRoom, "lobby");
    assert.equal(clients.get(socket)?.room, "general");
    assert.equal(rooms.get("lobby")?.has(socket), false);
    assert.equal(rooms.get("general")?.has(socket), true);
  });

  it("creates a room when it does not exist", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const socket = createSocket();

    clients.set(socket, createMeta("lobby"));
    rooms.set("lobby", new Set([socket]));

    const manager = new RoomManager(rooms, clients);

    manager.join(socket, "general");

    assert.equal(rooms.has("general"), true);
    assert.equal(rooms.get("general")?.has(socket), true);
  });

  it("leaves the current room", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const socket = createSocket();

    clients.set(socket, createMeta("general"));
    rooms.set("general", new Set([socket]));

    const manager = new RoomManager(rooms, clients);

    const room = manager.leave(socket);

    assert.equal(room, "general");
    assert.equal(rooms.get("general")?.has(socket), false);
  });

  it("does nothing when leaving with unknown client", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const socket = createSocket();

    const manager = new RoomManager(rooms, clients);

    assert.equal(manager.leave(socket), undefined);
  });

  it("throws when joining with unknown client", () => {
    const rooms: RoomsType = new Map();
    const clients: ClientsType = new Map();

    const socket = createSocket();

    const manager = new RoomManager(rooms, clients);

    assert.throws(() => manager.join(socket, "general"), /Client not found/);
  });
});
