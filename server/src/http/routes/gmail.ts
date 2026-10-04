import { Router } from "express";
import type { GmailStatusDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { missingGmailVars, readGmailConfig } from "../../gmail/gmailConfig.js";
import { findLastGmailRun, runGmailSync } from "../../gmail/syncGmail.js";

export const gmailRouter = Router();

gmailRouter.get("/status", asyncHandler(async (_req, res) => {
  const config = readGmailConfig(process.env);
  const status: GmailStatusDTO = {
    enabled: config !== null,
    missing: missingGmailVars(process.env),
    query: config?.query ?? null,
    intervalMinutes: config?.intervalMinutes ?? null,
    lastRun: await findLastGmailRun(),
  };
  res.json(status);
}));

gmailRouter.post("/sync", asyncHandler(async (_req, res) => {
  const config = readGmailConfig(process.env);
  if (!config) {
    throw new HttpError(409, `Gmail no está configurado: faltan ${missingGmailVars(process.env).join(", ")}`);
  }
  res.json(await runGmailSync(config, "manual"));
}));
