import { createServer, type RequestListener, type Server } from "node:http";
import { afterAll, afterEach, beforeAll } from "vitest";

const LOOPBACK_HOST = "127.0.0.1";

export const listenLocally = (app: RequestListener): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer(app);
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => resolve(server));
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

export interface LocalServer {
  server: Server;
}

export function withLocalServer(app: RequestListener): LocalServer {
  const local = {} as LocalServer;
  beforeAll(async () => {
    local.server = await listenLocally(app);
  });
  afterAll(() => closeServer(local.server));
  return local;
}

export function withLocalServers(): (app: RequestListener) => Promise<Server> {
  const open: Server[] = [];
  afterEach(async () => {
    await Promise.all(open.splice(0).map(closeServer));
  });
  return async (app) => {
    const server = await listenLocally(app);
    open.push(server);
    return server;
  };
}
