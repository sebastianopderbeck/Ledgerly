import { Router, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { MAIL_SOURCE_LABELS, mailSourceSchema } from "@ledgerly/shared";
import { HttpError, asyncHandler } from "../errors.js";
import { MISSING_OWNER, findOwnerId } from "../../auth/owner.js";
import { MAIL_TIME_ZONE, dayOfMonthIn, isScheduledDay, parseMailSchedule } from "../../mail/mailSchedule.js";
import { describeMissing, readMailSourceSetup } from "../../mail/mailSources.js";
import { runMailSync } from "../../mail/syncMail.js";

export interface CronDeps {
  env: NodeJS.ProcessEnv;
  ownerEmail: string;
  now: () => Date;
}

export const CRON_UNAUTHORIZED = "No autorizado";
export const OUT_OF_SCHEDULE = "fuera de agenda";

const sameText = (given: string, expected: string): boolean => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const isAuthorized = (req: Request, secret: string): boolean =>
  secret !== "" && sameText(req.get("authorization") ?? "", `Bearer ${secret}`);

export function createCronRouter({ env, ownerEmail, now }: CronDeps): Router {
  const router = Router();

  router.get("/mail/:source", asyncHandler(async (req, res) => {
    if (!isAuthorized(req, env.CRON_SECRET?.trim() ?? "")) throw new HttpError(401, CRON_UNAUTHORIZED);
    const parsed = mailSourceSchema.safeParse(req.params.source);
    if (!parsed.success) throw new HttpError(400, `Fuente de mails desconocida: ${req.params.source}`);
    const source = parsed.data;
    const { days } = parseMailSchedule(env);
    if (!days || !isScheduledDay(days, dayOfMonthIn(MAIL_TIME_ZONE, now()))) {
      res.json({ skipped: OUT_OF_SCHEDULE });
      return;
    }
    const ownerId = await findOwnerId(ownerEmail);
    if (!ownerId) {
      console.error(`${MAIL_SOURCE_LABELS[source]} (automática): ${MISSING_OWNER}`);
      res.json({ skipped: MISSING_OWNER });
      return;
    }
    const setup = await readMailSourceSetup(source, env);
    if (setup.missing.length > 0 || !setup.openClient) {
      const skipped = describeMissing(source, setup.missing);
      console.error(skipped);
      res.json({ skipped });
      return;
    }
    res.json(await runMailSync(ownerId, source, setup.openClient, "job"));
  }));

  return router;
}
