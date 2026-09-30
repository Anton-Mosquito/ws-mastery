import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";

import { ConnectionCleanupService } from "../../src/services/connection-cleanup-service.js";
import type {
  ClientMeta,
  ClientsType,
  RoomsType,
} from "../../src/types/index.js";

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

function createSocket() {
  return {
    readyState: WebSocket.OPEN,
  } as WebSocket;
}

function createDependencies(socket: WebSocket) {
  const clients: ClientsType = new Map();
  const rooms: RoomsType = new Map();
  const connectionsByIp = new Map<string, number>();

  const meta = createMeta();
  clients.set(socket, meta);
  rooms.set("general", new Set([socket]));
  connectionsByIp.set("127.0.0.1", 2);

  let unregistered = false;
  let roomLeft = false;

  const calls: string[] = [];
  const broadcastedRooms: string[] = [];

  const clientRegistry = {
    get(currentSocket: WebSocket) {
      return clients.get(currentSocket);
    },

    unregister(currentSocket: WebSocket) {
      const currentMeta = clients.get(currentSocket);

      if (!currentMeta) return undefined;

      clients.delete(currentSocket);
      unregistered = true;
      return currentMeta;
    },
  };

  const roomManager = {
    leave() {
      roomLeft = true;
      rooms.get("general")?.delete(socket);
      return "general";
    },
  };

  const presenceService = {
    async removeUser(room: string, username: string) {
      calls.push(`remove:${room}:${username}`);
      return 1;
    },
  };

  const broadcastService = {
    broadcast(room: string, data: unknown, excludeSocket?: WebSocket) {
      calls.push(`broadcast:${room}:${excludeSocket === socket}`);
      assert.deepEqual(data, {
        type: "system",
        text: "Anton вийшов із кімнати",
      });
    },
  };

  const broadcastPresence = async (room: string) => {
    broadcastedRooms.push(room);
  };

  return {
    clients,
    rooms,
    connectionsByIp,
    clientRegistry,
    roomManager,
    presenceService,
    broadcastService,
    broadcastPresence,
    calls,
    broadcastedRooms,
    getUnregistered: () => unregistered,
    getRoomLeft: () => roomLeft,
  };
}

describe("ConnectionCleanupService", () => {
  it("cleans up a connected client", async () => {
    const socket = createSocket();
    const deps = createDependencies(socket);

    const service = new ConnectionCleanupService(
      deps.clientRegistry,
      deps.roomManager,
      deps.presenceService,
      deps.broadcastService,
      deps.broadcastPresence,
      deps.connectionsByIp,
      deps.rooms,
    );

    await service.cleanup(socket, "127.0.0.1");

    assert.deepEqual(deps.calls, [
      "remove:general:Anton",
      "broadcast:general:true",
    ]);

    assert.equal(deps.getRoomLeft(), true);
    assert.equal(deps.getUnregistered(), true);
    assert.deepEqual(deps.broadcastedRooms, ["general"]);
    assert.equal(deps.connectionsByIp.get("127.0.0.1"), 1);
  });

  it("removes the IP counter when the client is the last connection", async () => {
    const socket = createSocket();
    const deps = createDependencies(socket);

    deps.connectionsByIp.set("127.0.0.1", 1);

    const service = new ConnectionCleanupService(
      deps.clientRegistry,
      deps.roomManager,
      deps.presenceService,
      deps.broadcastService,
      deps.broadcastPresence,
      deps.connectionsByIp,
      deps.rooms,
    );

    await service.cleanup(socket, "127.0.0.1");

    assert.equal(deps.connectionsByIp.has("127.0.0.1"), false);
  });

  it("does nothing for an unknown client", async () => {
    const socket = createSocket();
    const deps = createDependencies(socket);

    const unknownSocket = createSocket();

    const service = new ConnectionCleanupService(
      deps.clientRegistry,
      deps.roomManager,
      deps.presenceService,
      deps.broadcastService,
      deps.broadcastPresence,
      deps.connectionsByIp,
      deps.rooms,
    );

    await service.cleanup(unknownSocket, "127.0.0.1");

    assert.deepEqual(deps.calls, []);
    assert.equal(deps.getRoomLeft(), false);
    assert.equal(deps.getUnregistered(), false);
    assert.deepEqual(deps.broadcastedRooms, []);
  });

  it("does not reject when presence broadcast fails", async () => {
    const socket = createSocket();
    const deps = createDependencies(socket);

    const failingBroadcastPresence = async () => {
      throw new Error("Redis unavailable");
    };

    const service = new ConnectionCleanupService(
      deps.clientRegistry,
      deps.roomManager,
      deps.presenceService,
      deps.broadcastService,
      failingBroadcastPresence,
      deps.connectionsByIp,
      deps.rooms,
    );

    await assert.doesNotReject(service.cleanup(socket, "127.0.0.1"));

    assert.equal(deps.getUnregistered(), true);
  });
});
