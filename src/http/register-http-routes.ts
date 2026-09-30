import type { Server } from "http";
import { readFileSync } from "fs";

import type { LoginService } from "../services/login-service.js";

export function registerHttpRoutes(
  server: Server,
  loginService: LoginService,
): void {
  server.on("request", (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    if (url.pathname === "/messages.proto") {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        Vary: "Origin",
      });

      res.end(readFileSync("messages.proto", "utf8"));
      return;
    }

    if (url.pathname !== "/login") {
      res.writeHead(404, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        Vary: "Origin",
        Allow: "GET",
      });

      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const result = loginService.login(
      url.searchParams.get("username"),
      url.searchParams.get("userId"),
    );

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Vary: "Origin",
    });

    res.end(JSON.stringify(result));
  });
}
