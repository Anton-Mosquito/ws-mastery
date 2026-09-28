import { WebSocket } from "ws";

import type { ClientMeta } from "../types/index.js";

export class HeartbeatService {
  handlePing(socket: WebSocket, meta: ClientMeta, sentAt?: number) {
    meta.isAlive = true;

    socket.send(
      JSON.stringify({
        type: "pong",
        sentAt: sentAt ?? Date.now(),
      }),
    );
  }

  markAlive(meta: ClientMeta) {
    meta.isAlive = true;
  }
}
