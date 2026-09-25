import type { TokenPayload } from "../types/index.js";
import { isRecord } from "../utils/index.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-не-для-проду";

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, JWT_SECRET);

  if (
    !isRecord(payload) ||
    typeof payload.userId !== "string" ||
    typeof payload.username !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Invalid token payload");
  }

  return payload as unknown as TokenPayload;
}

export function getToken(userId: string, username: string) {
  return jwt.sign({ userId, username }, JWT_SECRET, {
    expiresIn: "1h",
  });
}
