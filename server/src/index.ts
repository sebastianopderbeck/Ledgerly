import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./http/app.js";
import { serveClient } from "./http/serveClient.js";
import { connectMongo } from "./db/connection.js";

const PORT = Number(process.env.PORT ?? 4000);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
const clientDist = join(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

await connectMongo(MONGO_URL);
const app = createApp();
serveClient(app, clientDist);
app.listen(PORT, () => {
  console.log(`Ledgerly API en http://localhost:${PORT}`);
});
