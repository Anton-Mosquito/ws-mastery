import type { RawData } from "ws";
import { WebSocket } from "ws";

import type {
  ClientMeta,
  ClientMessage,
  TokenPayload,
} from "../types/index.js";

import { RateLimiter } from "./rate-limiter.js";

import { parseClientMessage } from "../utils/parse-client-message.js";
import { parseWhisperCommand } from "../utils/parse-whisper-command.js";
import { toBuffer } from "../utils/to-buffer.js";

interface BroadcastServicePort {
  broadcast(
    roomName: string,
    data: ClientMessage | Buffer,
    excludeSocket?: WebSocket,
  ): void;
}

interface WhisperServicePort {
  handle(
    sender: WebSocket,
    senderUsername: string,
    command: {
      recipientUsername: string;
      text: string;
    },
  ): boolean;
}

interface RoomServicePort {
  join(socket: WebSocket, roomName: string): Promise<string>;
}

interface HeartbeatServicePort {
  handlePing(socket: WebSocket, meta: ClientMeta, sentAt?: number): void;

  markAlive(meta: ClientMeta): void;
}

interface TokenRefreshServicePort {
  refresh(
    currentPayload: TokenPayload,
    currentUsername: string,
    token: string,
  ):
    | {
        success: true;
        payload: TokenPayload;
      }
    | {
        success: false;
        reason: "identity_mismatch" | "invalid_token";
      };
}

export class MessageHandler {
  private readonly limiter = new RateLimiter(10, 5);
  private violations = 0;

  constructor(
    private readonly socket: WebSocket,
    private readonly meta: ClientMeta,
    private readonly payload: TokenPayload,
    private readonly broadcastService: BroadcastServicePort,
    private readonly whisperService: WhisperServicePort,
    private readonly roomService: RoomServicePort,
    private readonly heartbeatService: HeartbeatServicePort,
    private readonly tokenRefreshService: TokenRefreshServicePort,
  ) {}

  async handle(data: RawData, isBinary: boolean): Promise<void> {
    this.meta.lastActivity = Date.now();

    if (isBinary) {
      const payload = toBuffer(data);

      console.log(`📦 Бінарний фрейм, ${payload.length} байт`);

      this.broadcastService.broadcast(this.meta.room, payload);

      return;
    }

    console.log(`📝 Текстовий фрейм:`, data.toString());

    if (!this.limiter.tryConsume()) {
      this.violations++;

      console.log(
        `⚠️ Rate limit перевищено (${this.violations}) для ${this.payload.username}`,
      );

      this.socket.send(
        JSON.stringify({
          type: "error",
          message: "Занадто багато повідомлень, пригальмуй",
        }),
      );

      if (this.violations >= 5) {
        this.socket.close(1008, "Rate limit violation");
      }

      return;
    }

    const parsed = parseClientMessage(data.toString());

    if (!parsed.success) {
      this.socket.send(
        JSON.stringify({
          type: "error",
          message: parsed.errorMessage,
        }),
      );

      return;
    }

    const message: ClientMessage = parsed.message;

    if (message.type === "chat_message") {
      await this.handleChatMessage(message);
      return;
    }

    if (message.type === "join_room") {
      await this.handleJoinRoom(message);
      return;
    }

    if (message.type === "ping") {
      this.heartbeatService.handlePing(this.socket, this.meta, message.sentAt);
      return;
    }

    if (message.type === "refresh_token") {
      this.handleRefreshToken(message);
      return;
    }

    if (message.type === "pong") {
      this.heartbeatService.markAlive(this.meta);
    }
  }

  private async handleChatMessage(
    message: Extract<ClientMessage, { type: "chat_message" }>,
  ): Promise<void> {
    const whisper = parseWhisperCommand(message.text);

    if (whisper) {
      this.whisperService.handle(this.socket, this.meta.username, whisper);

      return;
    }

    const clientMessage: ClientMessage = {
      type: "chat_message",
      username: this.meta.username,
      text: message.text,
      timestamp: Date.now(),
    };

    this.broadcastService.broadcast(this.meta.room, clientMessage);
  }

  private async handleJoinRoom(
    message: Extract<ClientMessage, { type: "join_room" }>,
  ): Promise<void> {
    const roomName = message.room;
    const previousRoom = this.meta.room;

    const systemLeftMessage: ClientMessage = {
      type: "system",
      text: `${this.meta.username} залишив кімнату`,
    };

    this.broadcastService.broadcast(previousRoom, systemLeftMessage);

    try {
      await this.roomService.join(this.socket, roomName);
    } catch (error) {
      console.error(
        `💥 Presence room change error for ${this.meta.username}:`,
        error instanceof Error ? error.message : error,
      );

      this.socket.close(1011, "Presence unavailable");

      return;
    }

    const systemJoinMessage: ClientMessage = {
      type: "system",
      text: `${this.meta.username} приєднався до кімнати`,
    };

    this.broadcastService.broadcast(roomName, systemJoinMessage, this.socket);

    this.socket.send(
      JSON.stringify({
        type: "room_joined",
        room: roomName,
      }),
    );
  }

  private handleRefreshToken(
    message: Extract<ClientMessage, { type: "refresh_token" }>,
  ): void {
    const result = this.tokenRefreshService.refresh(
      this.payload,
      this.meta.username,
      message.token,
    );

    if (!result.success) {
      if (result.reason === "identity_mismatch") {
        this.socket.close(1008, "Token identity mismatch");

        return;
      }

      this.socket.close(1008, "Invalid refresh token");

      return;
    }

    this.meta.expiresAt = result.payload.exp;

    this.socket.send(
      JSON.stringify({
        type: "token_refreshed",
        expiresAt: result.payload.exp,
      }),
    );
  }
}
