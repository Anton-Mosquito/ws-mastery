import { WebSocket } from "ws";
import type { ClientsType } from "../types/index.js";

export function terminateSlowConsumer(clients: ClientsType, socket: WebSocket) {
  const meta = clients.get(socket);
  if (!meta || socket.readyState !== WebSocket.OPEN) return;

  console.warn(
    `🐌 Повільний клієнт ${meta.username}: bufferedAmount=${socket.bufferedAmount}. Відключення`,
  );

  socket.terminate();
}
