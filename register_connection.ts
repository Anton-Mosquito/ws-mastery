import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";

interface ClientMeta {
  id: string;
  username: string;
  room: string;
}

const wss = new WebSocketServer({ port: 8080 });
const clients = new Map<WebSocket, ClientMeta>();

wss.on("connection", (socket) => {
  const meta: ClientMeta = {
    id: nanoid(8),
    username: `Гість-${nanoid(4)}`,
    room: "lobby",
  };
  clients.set(socket, meta);
  console.log(
    `🔗 ${meta.username} (${meta.id}) підключився. Всього клієнтів: ${clients.size}`,
  );

  socket.on("close", () => {
    console.log(`❌ ${meta.username} відключився`);
    clients.delete(socket);
    console.log(`Залишилось клієнтів: ${clients.size}`);
  });
});

console.log("🚀 WS-сервер запущено на ws://localhost:8080");
