import { type IncomingMessage } from "http";
import { WebSocket } from "ws";
import type { RawData } from "ws";
import { registerHttpRoutes } from "./src/http/register-http-routes.js";

import type { TokenPayload, ClientMessage } from "./src/types/index.js";
import {
  PORT,
  MAX_CONNECTIONS_PER_IP,
  INSTANCE_ID,
} from "./src/constants/index.js";
import {
  benchmarkBroadcast,
  localBroadcast,
  getClientIp,
} from "./src/utils/index.js";
import {
  getToken,
  verifyToken,
  publisher,
  subscriber,
  ConnectionMonitor,
  RedisBroadcastSubscriber,
  MessageHandler,
} from "./src/services/index.js";
import { createApplication } from "./src/create-application.js";

console.log(`🆔 Instance ID: ${INSTANCE_ID}`);

const {
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
} = createApplication({
  publisher,
  getToken,
  verifyToken,
  instanceId: INSTANCE_ID,
});

const redisBroadcastSubscriber = new RedisBroadcastSubscriber(subscriber);

redisBroadcastSubscriber.start((room, data) => {
  localBroadcast(rooms, room, data, clients);
});

const monitorService = new ConnectionMonitor(clients, publisher);

monitorService.start();

function logAuthFailure(request: IncomingMessage, reason: string) {
  console.warn(
    `🔐 Невдала автентифікація IP=${getClientIp(request)}: ${reason}`,
  );
}

// async function broadcastPresence(roomName: string) {
//   const users = await presenceService.getUsers(roomName);

//   const message: ClientMessage = {
//     type: "presence_update",
//     users,
//   };

//   broadcastService.broadcast(roomName, message);
// }

// // While room entering
// async function joinRoomDistributed(socket: WebSocket, roomName: string) {
//   const meta = clients.get(socket)!;
//   const previousRoom = roomManager.join(socket, roomName);

//   console.log(
//     `📊 Кімната "${meta.room}": ${rooms.get(meta.room)?.size ?? 0} учасників`,
//   );

//   // share state in Redis
//   await presenceService.removeUser(previousRoom, meta.username);
//   await presenceService.addUser(roomName, meta.username);

//   // Send actual lists all instances
//   await broadcastPresence(previousRoom);
//   if (previousRoom !== roomName) {
//     await broadcastPresence(roomName);
//   }
// }

registerHttpRoutes(server, loginService);

server.on("upgrade", (request, socket, head) => {
  const clientIp = getClientIp(request);

  if ((connectionsByIp.get(clientIp) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
    logAuthFailure(request, "перевищено ліміт з'єднань");

    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }

  const authResult = webSocketAuthService.authenticate(request);

  if (!authResult.success) {
    logAuthFailure(request, authResult.reason);

    const statusText =
      authResult.statusCode === 403 ? "Forbidden" : "Unauthorized";

    socket.write(`HTTP/1.1 ${authResult.statusCode} ${statusText}\r\n\r\n`);
    socket.destroy();
    return;
  }

  const { payload } = authResult;

  // 2️⃣ Якщо все ок — завершуємо handshake
  wss.handleUpgrade(request, socket, head, (ws) => {
    connectionsByIp.set(clientIp, (connectionsByIp.get(clientIp) ?? 0) + 1);
    // Прокидуємо дані користувача далі
    wss.emit("connection", ws, request, payload, clientIp);
  });
});

wss.on(
  "connection",
  (
    socket: WebSocket,
    request: IncomingMessage,
    payload: TokenPayload,
    clientIp: string,
  ) => {
    const { username, userId } = payload;

    console.log("🌐 Origin:", request.headers.origin);
    console.log("🔍 Всі заголовки:", request.headers);
    console.log(`✅ Автентифіковано: ${username} (${userId})`);

    const meta = clientRegistry.register(socket, payload);

    const messageHandler = new MessageHandler(
      socket,
      meta,
      payload,
      broadcastService,
      whisperService,
      roomService,
      heartbeatService,
      tokenRefreshService,
    );

    const previousRoom = meta.room;

    void roomService
      .join(socket, "lobby")
      .then(() => {
        console.log(
          `📊 Кімната "${previousRoom}": ${
            rooms.get(previousRoom)?.size ?? 0
          } учасників`,
        );

        const message: ClientMessage = {
          type: "system",
          text: `${meta.username} приєднався до кімнати`,
        };

        broadcastService.broadcast("lobby", message);
      })
      .catch((error) => {
        console.error(
          `💥 Presence join error for ${meta.username}:`,
          error.message,
        );
        socket.close(1011, "Presence unavailable");
      });

    console.log(
      `🔗 ${meta.username} (${meta.id}) підключився. Всього клієнтів: ${clients.size}`,
    );

    socket.on("message", async (data: RawData, isBinary: boolean) => {
      void messageHandler.handle(data, isBinary);
    });

    socket.on("close", () => {
      connectionLifecycleService.handleClose(socket, clientIp);
    });

    socket.on("pong", () => {
      connectionLifecycleService.handlePong(meta);
    });
  },
);

benchmarkBroadcast(rooms, (room, data, excludeSocket) =>
  broadcastService.broadcast(room, data, excludeSocket),
);

async function handleShutdown() {
  console.log("Shutting down server...");
  console.log("🛑 Graceful shutdown...");

  for (const [socket, meta] of clients) {
    await presenceService.removeUser(meta.room, meta.username);
    socket.close(1001, "Server shutting down");
  }

  await publisher.quit();
  await subscriber.quit();
  monitorService.stop();

  wss.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

console.log("🚀 WS-сервер запущено на ws://localhost:8080");

server.listen(PORT, () =>
  console.log(`🚀 Інстанс на порту ${PORT} (PID ${process.pid})`),
);
