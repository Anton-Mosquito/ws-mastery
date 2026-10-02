import { type IncomingMessage } from "http";
import { registerHttpRoutes } from "./src/http/register-http-routes.js";
import { PORT, INSTANCE_ID } from "./src/constants/index.js";
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
} from "./src/services/index.js";
import { createApplication } from "./src/create-application.js";
import { registerWebSocketHandlers } from "./src/http/register-websocket-handlers.js";

console.log(`🆔 Instance ID: ${INSTANCE_ID}`);

const application = createApplication({
  publisher,
  getToken,
  verifyToken,
  instanceId: INSTANCE_ID,
});

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
} = application;

const redisBroadcastSubscriber = new RedisBroadcastSubscriber(subscriber);

redisBroadcastSubscriber.start((room, data) => {
  localBroadcast(rooms, room, data, clients);
});

const monitorService = new ConnectionMonitor(clients, publisher);

monitorService.start();

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

registerWebSocketHandlers(application);

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
