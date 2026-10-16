import { createConnector } from "../server/src/db/serverlessConnection.js";
import { buildApp, createHandler } from "../server/src/vercel/handler.js";

export default createHandler({ env: process.env, connect: createConnector(), build: buildApp });
