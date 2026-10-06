import type { WebSocket } from "ws";
import type { z } from "zod";
import type {
  messageSchema,
  redisEnvelopeSchema,
  serverMessageSchema,
} from "../schemas/index.js";

export type ClientMessage = z.infer<typeof messageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type RedisEnvelope = z.infer<typeof redisEnvelopeSchema>;

export interface ClientMeta {
  id: string;
  username: string;
  room: string;
  isAlive: boolean;
  expiresAt: number;
  lastActivity: number;
}

export interface TokenPayload {
  userId: string;
  username: string;
  exp: number;
}

export type RoomsType = Map<string, Set<WebSocket>>;
export type ClientsType = Map<WebSocket, ClientMeta>;

export type BroadcastData =
  | ClientMessage
  | string
  | Buffer
  | ArrayBuffer
  | Uint8Array;

export type ParseClientMessageResult =
  | {
      success: true;
      message: ClientMessage;
    }
  | {
      success: false;
      errorMessage: "Некоректний JSON" | "Невірний формат повідомлення";
    };

export interface WhisperCommand {
  recipientUsername: string;
  text: string;
}

export type WebSocketAuthResult =
  | {
      success: true;
      payload: TokenPayload;
    }
  | {
      success: false;
      statusCode: 401 | 403;
      reason: string;
    };

export type VerifyToken = (token: string) => TokenPayload;

export type TokenRefreshResult =
  | {
      success: true;
      payload: TokenPayload;
    }
  | {
      success: false;
      reason: "identity_mismatch" | "invalid_token";
    };

export interface LoginResult {
  token: string;
  expiresIn: "1h";
  userId: string;
  username: string;
}
