import { Router } from "express";
import type { Types } from "mongoose";
import { mailSourceSchema, type MailSourceStatusDTO } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { describeMailSchedule } from "../../mail/mailSchedule.js";
import { describeMissing, readMailSourceSetup, readMailSourceSetups } from "../../mail/mailSources.js";
import type { MailSourceSetup } from "../../mail/mailSourceSetup.js";
import { findLastMailRun, runMailSync } from "../../mail/syncMail.js";
import { userIdOf } from "../../auth/requireUser.js";

export const mailRouter = Router();

const toStatus = (userId: Types.ObjectId) => async (
  { source, missing, scope, schedule, openClient }: MailSourceSetup,
): Promise<MailSourceStatusDTO> => ({
  source,
  enabled: missing.length === 0 && openClient !== null,
  missing,
  scope,
  schedule: schedule ? describeMailSchedule(schedule) : null,
  lastRun: await findLastMailRun(userId, source),
});

mailRouter.get("/status", asyncHandler(async (req, res) => {
  const setups = await readMailSourceSetups(process.env);
  res.json(await Promise.all(setups.map(toStatus(userIdOf(req)))));
}));

mailRouter.post("/:source/sync", asyncHandler(async (req, res) => {
  const parsed = mailSourceSchema.safeParse(req.params.source);
  if (!parsed.success) throw new HttpError(400, `Fuente de mails desconocida: ${req.params.source}`);
  const source = parsed.data;
  const setup = await readMailSourceSetup(source, process.env);
  if (setup.missing.length > 0 || !setup.openClient) {
    throw new HttpError(409, describeMissing(source, setup.missing));
  }
  res.json(await runMailSync(userIdOf(req), source, setup.openClient, "manual"));
}));
