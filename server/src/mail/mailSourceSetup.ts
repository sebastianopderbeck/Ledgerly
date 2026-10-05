import type { MailSource } from "@ledgerly/shared";
import type { MailSchedule } from "./mailSchedule.js";
import type { OpenMailClient } from "./mailClient.js";

export interface MailSourceSetup {
  source: MailSource;
  missing: string[];
  scope: string | null;
  schedule: MailSchedule | null;
  openClient: OpenMailClient | null;
}
