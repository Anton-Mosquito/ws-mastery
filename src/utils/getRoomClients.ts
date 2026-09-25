import type { RoomsType } from "../types/index.js";

export function getRoomClients(
  rooms: RoomsType,
  roomName: string,
): Set<WebSocket> | void {
  const clients = rooms.get(roomName);

  if (!clients) return;

  return rooms.get(roomName);
}
