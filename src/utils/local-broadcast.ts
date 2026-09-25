import type { RoomsType, BroadcastData, ClientsType } from "../types/index.js";
import { MAX_BUFFERED_AMOUNT } from "../constants/index.js";
import { terminateSlowConsumer } from "./index.js";

// export function localBroadcast(
//   rooms: RoomsType,
//   roomName: string,
//   message: ClientMessage,
//   clients: ClientsType,
//   excludeSocket?: WebSocket,
// ) {
//   const roomClients = rooms.get(roomName);
//   if (!roomClients) return;

//   const payload = JSON.stringify(message); // серіалізуємо ОДИН раз

//   for (const client of roomClients) {
//     if (client === excludeSocket) continue;
//     if (client.readyState === WebSocket.OPEN) {
//       if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
//         terminateSlowConsumer(clients, client);
//         continue;
//       }
//       client.send(payload);
//     }
//   }
// }

export function localBroadcast(
  rooms: RoomsType,
  roomName: string,
  data: BroadcastData,
  clients: ClientsType,
  excludeSocket?: WebSocket,
) {
  const roomClients = rooms.get(roomName);
  if (!roomClients) return;

  // Якщо дані вже є готовим Buffer/string, використовуємо як є, інакше серіалізуємо в JSON
  const payload =
    typeof data === "string" ||
    Buffer.isBuffer(data) ||
    data instanceof ArrayBuffer
      ? data
      : JSON.stringify(data);

  for (const client of roomClients) {
    if (client === excludeSocket) continue;
    if (client.readyState !== WebSocket.OPEN) continue;

    if (client.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      terminateSlowConsumer(clients, client);
      continue;
    }

    client.send(payload);
  }
}
