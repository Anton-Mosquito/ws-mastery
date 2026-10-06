import http from "http";
import { WebSocketServer, WebSocket } from "ws";

import type {
  ClientsType,
  ClientMessage,
  RoomsType,
  TokenPayload,
} from "./types/index.js";

import { BroadcastService } from "./services/broadcast-service.js";
import { ClientRegistry } from "./services/client-registry.js";
import { ConnectionCleanupService } from "./services/connection-cleanup-service.js";
import { ConnectionLifecycleService } from "./services/connection-lifecycle-service.js";
import { HeartbeatService } from "./services/heartbeat-service.js";
import { LoginService } from "./services/login-service.js";
import { PresenceService } from "./services/presence-service.js";
import { RoomManager } from "./services/room-manager.js";
import { RoomService } from "./services/room-service.js";
import { TokenRefreshService } from "./services/token-refresh-service.js";
import { WebSocketAuthService } from "./services/websocket-auth-service.js";
import { WhisperService } from "./services/whisper-service.js";

interface Publisher {
  publish(channel: string, message: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

export interface CreateApplicationDependencies {
  publisher: Publisher;
  getToken: (username: string, userId: string) => string;
  verifyToken: (token: string) => TokenPayload;
  instanceId: string;
}

export interface ApplicationContext {
  server: http.Server;
  wss: WebSocketServer;

  clients: ClientsType;
  clientsByUsername: Map<string, WebSocket>;
  rooms: RoomsType;
  connectionsByIp: Map<string, number>;

  clientRegistry: ClientRegistry;
  whisperService: WhisperService;
  roomManager: RoomManager;
  presenceService: PresenceService;
  broadcastService: BroadcastService;
  roomService: RoomService;
  tokenRefreshService: TokenRefreshService;
  webSocketAuthService: WebSocketAuthService;
  heartbeatService: HeartbeatService;
  connectionCleanupService: ConnectionCleanupService;
  connectionLifecycleService: ConnectionLifecycleService;
  loginService: LoginService;

  broadcastPresence: (roomName: string) => Promise<void>;
}

export function createApplication(
  dependencies: CreateApplicationDependencies,
): ApplicationContext {
  const server = http.createServer();

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
  });

  const clients: ClientsType = new Map();
  const clientsByUsername = new Map<string, WebSocket>();
  const rooms: RoomsType = new Map();
  const connectionsByIp = new Map<string, number>();

  const clientRegistry = new ClientRegistry(clients, clientsByUsername);

  const whisperService = new WhisperService(clientsByUsername, clients);

  const roomManager = new RoomManager(rooms, clients);

  const presenceService = new PresenceService(dependencies.publisher);

  const broadcastService = new BroadcastService(
    rooms,
    clients,
    dependencies.publisher,
    dependencies.instanceId,
  );

  const roomService = new RoomService(
    roomManager,
    presenceService,
    clients,
    broadcastPresence,
  );

  const tokenRefreshService = new TokenRefreshService(dependencies.verifyToken);

  const webSocketAuthService = new WebSocketAuthService(
    dependencies.verifyToken,
  );

  const heartbeatService = new HeartbeatService();

  const connectionCleanupService = new ConnectionCleanupService(
    clientRegistry,
    roomManager,
    presenceService,
    broadcastService,
    broadcastPresence,
    connectionsByIp,
    rooms,
  );

  const connectionLifecycleService = new ConnectionLifecycleService(
    connectionCleanupService,
    heartbeatService,
  );

  const loginService = new LoginService(dependencies.getToken);

  async function broadcastPresence(roomName: string) {
    const users = await presenceService.getUsers(roomName);

    const message: ClientMessage = {
      type: "presence_update",
      users,
    };

    broadcastService.broadcast(roomName, message);
  }

  return {
    server,
    wss,
    clients,
    clientsByUsername,
    rooms,
    connectionsByIp,
    clientRegistry,
    whisperService,
    roomManager,
    presenceService,
    broadcastService,
    roomService,
    tokenRefreshService,
    webSocketAuthService,
    heartbeatService,
    connectionCleanupService,
    connectionLifecycleService,
    loginService,
    broadcastPresence,
  };
}
