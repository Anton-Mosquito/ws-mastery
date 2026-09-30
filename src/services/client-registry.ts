import type { WebSocket } from "ws";
import { nanoid } from "nanoid";

import type { ClientMeta, ClientsType, TokenPayload } from "../types/index.js";

export class ClientRegistry {
  constructor(
    private readonly clients: ClientsType,
    private readonly clientsByUsername: Map<string, WebSocket>,
  ) {}

  register(socket: WebSocket, payload: TokenPayload): ClientMeta {
    const { username, exp } = payload;

    const meta: ClientMeta = {
      id: nanoid(8),
      username,
      room: "lobby",
      isAlive: true,
      expiresAt: exp,
      lastActivity: Date.now(),
    };

    this.clients.set(socket, meta);
    this.clientsByUsername.set(username, socket);

    return meta;
  }

  get(socket: WebSocket): ClientMeta | undefined {
    return this.clients.get(socket);
  }

  unregister(socket: WebSocket): ClientMeta | undefined {
    const meta = this.clients.get(socket);

    if (!meta) return undefined;

    this.clients.delete(socket);
    this.clientsByUsername.delete(meta.username);

    return meta;
  }
}
