import type { WebSocket } from "ws";
import type { ClientMeta } from "../types/index.js";

interface ConnectionCleanupService {
  cleanup(socket: WebSocket, clientIp: string): Promise<void>;
}

interface HeartbeatService {
  markAlive(meta: ClientMeta): void;
}

export class ConnectionLifecycleService {
  constructor(
    private readonly connectionCleanupService: ConnectionCleanupService,
    private readonly heartbeatService: HeartbeatService,
  ) {}

  handleClose(socket: WebSocket, clientIp: string): void {
    void this.connectionCleanupService
      .cleanup(socket, clientIp)
      .catch((error) => {
        console.error("💥 Connection cleanup error:", error);
      });
  }

  handlePong(meta: ClientMeta): void {
    this.heartbeatService.markAlive(meta);
    console.log(`💓 Pong від ${meta.username}`);
  }
}
