import type { IncomingMessage } from "http";

export function getClientIp(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? "unknown";
}
