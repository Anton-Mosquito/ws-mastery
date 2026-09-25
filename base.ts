import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (socket: WebSocket, request) => {
  console.log("🔗 Нове з'єднання від:", request.socket.remoteAddress);
  console.log("📝 Заголовки:", request.headers);

  if (
    !request.headers.origin ||
    request.headers.origin !== "https://example.com"
  ) {
    socket.close(1008, "Invalid origin");
    return;
  }

  socket.on("message", (data) => {
    console.log("📩 Отримано:", data.toString());
    // Echo назад
    socket.send(`Сервер отримав: ${data.toString()}`);
  });

  socket.on("close", (code, reason) => {
    console.log(`❌ З'єднання закрито. Код: ${code}, причина: ${reason}`);
  });

  socket.on("error", (err) => {
    console.error("💥 Помилка сокета:", err.message);
  });

  socket.send("👋 Ласкаво просимо на сервер!");

  // setTimeout(() => {
  //   socket.close(4001, "Тестове закриття з кастомним кодом");
  // }, 10000);
});

console.log("🚀 WS-сервер запущено на ws://localhost:8080");
