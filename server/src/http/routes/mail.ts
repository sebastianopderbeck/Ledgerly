import { Router } from "express";
import { MAIL_SOURCE_LABELS, mailSourceSchema, type MailSourceStatusDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { readMailSourceSetup, readMailSourceSetups } from "../../mail/mailSources.js";
import type { MailSourceSetup } from "../../mail/mailSourceSetup.js";
import { findLastMailRun, runMailSync } from "../../mail/syncMail.js";

export const mailRouter = Router();

const toStatus = async ({ source, missing, scope, intervalMinutes, openClient }: MailSourceSetup): Promise<MailSourceStatusDTO> => ({
  source, enabled: missing.length === 0 && openClient !== null, missing, scope, intervalMinutes, lastRun: await findLastMailRun(source),
});

const missingText = (missing: string[]): string => `${missing.length === 1 ? "falta" : "faltan"} ${missing.join(", ")}`;

mailRouter.get("/status", asyncHandler(async (_req, res) => {
  const setups = await readMailSourceSetups(process.env);
  res.json(await Promise.all(setups.map(toStatus)));
}));

mailRouter.post("/:source/sync", asyncHandler(async (req, res) => {
  const parsed = mailSourceSchema.safeParse(req.params.source);
  if (!parsed.success) throw new HttpError(400, `Fuente de mails desconocida: ${req.params.source}`);
  const source = parsed.data;
  const setup = await readMailSourceSetup(source, process.env);
  if (setup.missing.length > 0 || !setup.openClient) {
    throw new HttpError(409, `${MAIL_SOURCE_LABELS[source]} no está configurado: ${missingText(setup.missing)}`);
  }
  res.json(await runMailSync(source, setup.openClient, "manual"));
}));
