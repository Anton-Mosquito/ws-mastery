import type { WebSocket } from "ws";

import type {
  ClientMeta,
  ClientMessage,
  ClientsType,
  RoomsType,
} from "../types/index.js";

interface ClientRegistry {
  get(socket: WebSocket): ClientMeta | undefined;
  unregister(socket: WebSocket): ClientMeta | undefined;
}

interface RoomManager {
  leave(socket: WebSocket): string | undefined;
}

interface PresenceService {
  removeUser(roomName: string, username: string): Promise<number>;
}

interface BroadcastService {
  broadcast(
    roomName: string,
    data: ClientMessage | Buffer,
    excludeSocket?: WebSocket,
  ): void;
}

type BroadcastPresence = (roomName: string) => Promise<void>;

export class ConnectionCleanupService {
  constructor(
    private readonly clientRegistry: ClientRegistry,
    private readonly roomManager: RoomManager,
    private readonly presenceService: PresenceService,
    private readonly broadcastService: BroadcastService,
    private readonly broadcastPresence: BroadcastPresence,
    private readonly connectionsByIp: Map<string, number>,
    private readonly rooms: RoomsType,
  ) {}

  async cleanup(socket: WebSocket, clientIp: string): Promise<void> {
    const meta = this.clientRegistry.get(socket);

    if (!meta) return;

    const roomName = meta.room;
    const username = meta.username;

    await this.presenceService.removeUser(roomName, username);

    this.broadcastService.broadcast(
      roomName,
      {
        type: "system",
        text: `${username} вийшов із кімнати`,
      },
      socket,
    );

    this.roomManager.leave(socket);

    console.log(
      `📊 Кімната "${roomName}": ${
        this.rooms.get(roomName)?.size ?? 0
      } учасників`,
    );

    this.clientRegistry.unregister(socket);

    const remaining = (this.connectionsByIp.get(clientIp) ?? 1) - 1;

    if (remaining > 0) {
      this.connectionsByIp.set(clientIp, remaining);
    } else {
      this.connectionsByIp.delete(clientIp);
    }

    void this.broadcastPresence(roomName).catch((error) => {
      console.error(`💥 Presence leave error for ${username}:`, error.message);
    });
  }
}
