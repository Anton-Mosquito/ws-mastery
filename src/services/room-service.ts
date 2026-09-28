import type { WebSocket } from "ws";

import type { ClientMeta, ClientsType } from "../types/index.js";

interface RoomManager {
  join(socket: WebSocket, roomName: string): string;
}

interface PresenceService {
  addUser(roomName: string, username: string): Promise<number>;
  removeUser(roomName: string, username: string): Promise<number>;
}

type BroadcastPresence = (roomName: string) => Promise<void>;

export class RoomService {
  constructor(
    private readonly roomManager: RoomManager,
    private readonly presenceService: PresenceService,
    private readonly clients: ClientsType,
    private readonly broadcastPresence: BroadcastPresence,
  ) {}

  async join(socket: WebSocket, roomName: string): Promise<string> {
    const meta: ClientMeta | undefined = this.clients.get(socket);

    if (!meta) {
      throw new Error("Client not found");
    }

    const previousRoom = this.roomManager.join(socket, roomName);

    await this.presenceService.removeUser(previousRoom, meta.username);

    await this.presenceService.addUser(roomName, meta.username);

    await this.broadcastPresence(previousRoom);

    if (previousRoom !== roomName) {
      await this.broadcastPresence(roomName);
    }

    return previousRoom;
  }
}
