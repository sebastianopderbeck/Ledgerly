import type { MailClient } from "../mail/mailClient.js";
import type { MailSourceSetup } from "../mail/mailSourceSetup.js";
import { createGmailClient, type GmailClient, type GmailPdfPart } from "./gmailClient.js";
import { missingGmailVars, readGmailConfig } from "./gmailConfig.js";

export function gmailMailClient(client: GmailClient, query: string): MailClient<GmailPdfPart> {
  return {
    listMessageIds: (limit) => client.listMessageIds(query, limit),
    getMessage: (id) => client.getMessage(id),
    downloadPart: (messageId, part) => client.downloadPart(messageId, part),
    close: async () => undefined,
  };
}

export function gmailSourceSetup(env: NodeJS.ProcessEnv): MailSourceSetup {
  const config = readGmailConfig(env);
  if (!config) {
    return { source: "gmail", missing: missingGmailVars(env), scope: null, intervalMinutes: null, openClient: null };
  }
  const { credentials, query, intervalMinutes } = config;
  return {
    source: "gmail",
    missing: [],
    scope: query,
    intervalMinutes,
    openClient: async () => gmailMailClient(createGmailClient(credentials), query),
  };
}
