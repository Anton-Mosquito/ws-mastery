import type { WebSocket } from "ws";
import type { ClientMessage, ClientsType, RoomsType } from "../types/index.js";

import { INSTANCE_ID } from "../constants/index.js";
import { localBroadcast } from "../utils/local-broadcast.js";

interface Publisher {
  publish(channel: string, message: string): Promise<number>;
}

export class BroadcastService {
  constructor(
    private readonly rooms: RoomsType,
    private readonly clients: ClientsType,
    private readonly publisher: Publisher,
    private readonly instanceId: string = INSTANCE_ID,
  ) {}

  broadcast(
    roomName: string,
    data: ClientMessage | Buffer,
    excludeSocket?: WebSocket,
  ) {
    localBroadcast(this.rooms, roomName, data, this.clients, excludeSocket);

    const isBinary = Buffer.isBuffer(data);

    const redisPayload = isBinary
      ? {
          instanceId: this.instanceId,
          kind: "binary" as const,
          room: roomName,
          payload: data.toString("base64"),
        }
      : {
          instanceId: this.instanceId,
          kind: "json" as const,
          room: roomName,
          message: data,
        };

    this.publisher
      .publish("ws:broadcast", JSON.stringify(redisPayload))
      .catch((error) => {
        console.error(
          `💥 Redis ${isBinary ? "binary " : ""}publish error:`,
          error.message,
        );
      });
  }
}
