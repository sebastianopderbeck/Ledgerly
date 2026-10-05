import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "./http/app.js";
import { serveClient } from "./http/serveClient.js";
import { resolveListenOptions } from "./http/listenOptions.js";
import { connectMongo } from "./db/connection.js";
import { describeGmailSetup } from "./gmail/gmailConfig.js";
import { describeIcloudSource } from "./icloud/icloudSource.js";
import { startMailJob } from "./mail/mailJob.js";
import { readMailSourceSetups } from "./mail/mailSources.js";

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

console.log(describeGmailSetup(process.env));
console.log(await describeIcloudSource(process.env));
for (const setup of await readMailSourceSetups(process.env)) await startMailJob(setup);
