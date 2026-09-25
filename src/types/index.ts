import type { WebSocket } from "ws";
import type { ClientMessage } from "../schemas/index.js";

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

export interface MonitorConfig {
  idleTimeout: number;
  idleCheckInterval: number;
  tokenCheckInterval: number;
  slowConsumerInterval?: number;
}

export type { ClientMessage, RedisEnvelope } from "../schemas/index.js";
