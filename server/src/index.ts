import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./http/app.js";
import { serveClient } from "./http/serveClient.js";
import { resolveListenOptions } from "./http/listenOptions.js";
import { connectMongo } from "./db/connection.js";

const { port, host } = resolveListenOptions(process.env);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
const clientDist = join(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

await connectMongo(MONGO_URL);
const app = createApp();
serveClient(app, clientDist);

const logListening = (): void => {
  console.log(`Ledgerly API en http://${host ?? "localhost"}:${port}`);
};

if (host) {
  app.listen(port, host, logListening);
} else {
  app.listen(port, logListening);
}
