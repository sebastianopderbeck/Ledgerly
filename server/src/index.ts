import { createApp } from "./http/app.js";
import { connectMongo } from "./db/connection.js";

const PORT = Number(process.env.PORT ?? 4000);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";

await connectMongo(MONGO_URL);
createApp().listen(PORT, () => {
  console.log(`Ledgerly API en http://localhost:${PORT}`);
});
