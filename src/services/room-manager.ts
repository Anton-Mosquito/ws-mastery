import type { WebSocket } from "ws";
import type { ClientsType, RoomsType } from "../types/index.js";

export class RoomManager {
  constructor(
    private readonly rooms: RoomsType,
    private readonly clients: ClientsType,
  ) {}

  join(socket: WebSocket, roomName: string): string {
    const meta = this.clients.get(socket);

    if (!meta) {
      throw new Error("Client not found");
    }

    const previousRoom = meta.room;

    this.rooms.get(previousRoom)?.delete(socket);

    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }

    this.rooms.get(roomName)!.add(socket);
    meta.room = roomName;

    return previousRoom;
  }

  leave(socket: WebSocket): string | undefined {
    const meta = this.clients.get(socket);

    if (!meta) return undefined;

    this.rooms.get(meta.room)?.delete(socket);

    return meta.room;
  }
}
