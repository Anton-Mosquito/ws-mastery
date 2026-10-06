import { registerHttpRoutes } from "./src/http/register-http-routes.js";
import { PORT, INSTANCE_ID } from "./src/constants/index.js";
import { benchmarkBroadcast } from "./src/utils/benchmark.js";
import { localBroadcast } from "./src/utils/local-broadcast.js";
import {
  getToken,
  verifyToken,
  ConnectionMonitor,
  RedisBroadcastSubscriber,
} from "./src/services/index.js";

import { publisher, subscriber } from "./src/services/redis.js";
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
  rooms,
  presenceService,
  broadcastService,
  loginService,
} = application;

const redisBroadcastSubscriber = new RedisBroadcastSubscriber(subscriber);

redisBroadcastSubscriber.start((room, data) => {
  localBroadcast(rooms, room, data, clients);
});

const monitorService = new ConnectionMonitor(clients, publisher);

monitorService.start();

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
