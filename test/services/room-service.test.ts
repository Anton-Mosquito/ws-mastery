import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { RoomService } from "../../src/services/room-service.js";
import type { ClientMeta, ClientsType } from "../../src/types/index.js";

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

function createRoomManager(previousRoom = "lobby") {
  const calls: Array<{
    socket: WebSocket;
    room: string;
  }> = [];

  return {
    calls,

    join(socket: WebSocket, roomName: string) {
      calls.push({ socket, room: roomName });
      return previousRoom;
    },
  };
}

function createPresenceService() {
  const calls: Array<{
    method: string;
    room: string;
    username: string;
  }> = [];

  return {
    calls,

    async removeUser(room: string, username: string) {
      calls.push({
        method: "remove",
        room,
        username,
      });

      return 1;
    },

    async addUser(room: string, username: string) {
      calls.push({
        method: "add",
        room,
        username,
      });

      return 1;
    },
  };
}

describe("RoomService", () => {
  it("moves a client and updates Redis presence", async () => {
    const socket = createSocket();
    const clients: ClientsType = new Map();

    clients.set(socket, createMeta("lobby"));

    const roomManager = createRoomManager("lobby");
    const presenceService = createPresenceService();

    const broadcastedRooms: string[] = [];

    const service = new RoomService(
      roomManager,
      presenceService,
      clients,
      async (room) => {
        broadcastedRooms.push(room);
      },
    );

    const previousRoom = await service.join(socket, "general");

    assert.equal(previousRoom, "lobby");

    assert.deepEqual(roomManager.calls, [
      {
        socket,
        room: "general",
      },
    ]);

    assert.deepEqual(presenceService.calls, [
      {
        method: "remove",
        room: "lobby",
        username: "Anton",
      },
      {
        method: "add",
        room: "general",
        username: "Anton",
      },
    ]);

    assert.deepEqual(broadcastedRooms, ["lobby", "general"]);
  });

  it("does not broadcast the same room twice", async () => {
    const socket = createSocket();
    const clients: ClientsType = new Map();

    clients.set(socket, createMeta("general"));

    const roomManager = createRoomManager("general");
    const presenceService = createPresenceService();

    const broadcastedRooms: string[] = [];

    const service = new RoomService(
      roomManager,
      presenceService,
      clients,
      async (room) => {
        broadcastedRooms.push(room);
      },
    );

    await service.join(socket, "general");

    assert.deepEqual(broadcastedRooms, ["general"]);
  });

  it("throws when client is missing", async () => {
    const socket = createSocket();
    const clients: ClientsType = new Map();

    const roomManager = createRoomManager();
    const presenceService = createPresenceService();

    const service = new RoomService(
      roomManager,
      presenceService,
      clients,
      async () => {},
    );

    await assert.rejects(
      () => service.join(socket, "general"),
      /Client not found/,
    );

    assert.equal(roomManager.calls.length, 0);
    assert.equal(presenceService.calls.length, 0);
  });
});
