import type { ClientsType, ServerMessage } from "../types/index.js";
import { MAX_BUFFERED_AMOUNT } from "../constants/index.js";
import { terminateSlowConsumer } from "./terminate-slow-consumer.js";
import { WebSocket } from "ws";

export function sendToClient(
  socket: WebSocket,
  message: ServerMessage,
  clients: ClientsType,
) {
  if (socket.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    terminateSlowConsumer(clients, socket);
    return false;
  }

  socket.send(JSON.stringify(message));
  return true;
}
