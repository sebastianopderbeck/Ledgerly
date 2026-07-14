import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function serveClient(app: Express, distDir: string): void {
  if (!existsSync(distDir)) return;
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(join(distDir, "index.html"));
  });
}
