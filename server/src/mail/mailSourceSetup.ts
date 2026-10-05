import type { MailSource } from "@ledgerly/shared";
import type { OpenMailClient } from "./mailClient.js";

export interface MailSourceSetup {
  source: MailSource;
  missing: string[];
  scope: string | null;
  intervalMinutes: number | null;
  openClient: OpenMailClient | null;
}
