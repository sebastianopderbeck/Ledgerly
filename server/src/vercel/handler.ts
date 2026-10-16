import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { readAuthConfig } from "../auth/authConfig.js";
import { createApp } from "../http/app.js";

export interface HandlerDeps {
  env: NodeJS.ProcessEnv;
  connect: (url: string) => Promise<void>;
  build: (env: NodeJS.ProcessEnv) => Express;
}

const INTERNAL_ERROR = JSON.stringify({ error: "Error interno" });

const mongoUrlOf = (env: NodeJS.ProcessEnv): string => {
  const url = env.MONGO_URL?.trim() ?? "";
  if (url === "") throw new Error("Falta MONGO_URL");
  return url;
};

const replyInternalError = (res: ServerResponse): void => {
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(INTERNAL_ERROR);
};

export const buildApp = (env: NodeJS.ProcessEnv): Express => createApp(readAuthConfig(env), { env });

export function createHandler({ env, connect, build }: HandlerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  let app: Express | null = null;
  return async (req, res) => {
    try {
      await connect(mongoUrlOf(env));
      app ??= build(env);
    } catch (error) {
      console.error(`Arranque: ${error instanceof Error ? error.message : String(error)}`);
      replyInternalError(res);
      return;
    }
    app(req, res);
  };
}
