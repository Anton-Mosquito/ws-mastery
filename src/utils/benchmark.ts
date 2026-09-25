import type { RoomsType, ClientMessage } from "../types/index.js";

export function benchmarkBroadcast(
  rooms: RoomsType,
  fn: (
    room: string,
    message: ClientMessage | Buffer,
    excludeSocket?: WebSocket,
  ) => void,
) {
  const fakeClients = Array.from(
    { length: 100 },
    () =>
      ({
        readyState: WebSocket.OPEN,
        send: () => {},
      }) as unknown as WebSocket,
  );
  rooms.set("benchmark", new Set(fakeClients));

  console.time("broadcast 100 fake clients");
  fn("benchmark", { type: "system", text: "benchmark" });
  console.timeEnd("broadcast 100 fake clients");

  rooms.delete("benchmark");
}
