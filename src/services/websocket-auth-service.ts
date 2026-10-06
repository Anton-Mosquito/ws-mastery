import type { IncomingMessage } from "http";
import type { WebSocketAuthResult, VerifyToken } from "../types/index.js";
import { ALLOWED_ORIGINS } from "../constants/index.js";

export class WebSocketAuthService {
  constructor(
    private readonly verifyToken: VerifyToken,
    private readonly allowedOrigins: readonly string[] = ALLOWED_ORIGINS,
  ) {}

  authenticate(request: IncomingMessage): WebSocketAuthResult {
    const origin = request.headers.origin;

    if (!origin || !this.allowedOrigins.includes(origin)) {
      return {
        success: false,
        statusCode: 403,
        reason: `відхилений Origin: ${origin ?? "відсутній"}`,
      };
    }

    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );

    const token = url.searchParams.get("token");

    if (!token) {
      return {
        success: false,
        statusCode: 401,
        reason: "відсутній токен",
      };
    }

    try {
      const payload = this.verifyToken(token);

      return {
        success: true,
        payload,
      };
    } catch {
      return {
        success: false,
        statusCode: 401,
        reason: "невалідний або прострочений токен",
      };
    }
  }
}
