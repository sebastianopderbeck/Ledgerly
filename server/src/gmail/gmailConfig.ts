import { MIN_SYNC_INTERVAL_MINUTES, parseSyncInterval } from "../mail/syncInterval.js";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_CREDENTIAL_VARS = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"] as const;
export const DEFAULT_GMAIL_QUERY = "has:attachment filename:pdf newer_than:90d";

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailConfig {
  credentials: GmailCredentials;
  query: string;
  intervalMinutes: number | null;
}

const valueOf = (env: NodeJS.ProcessEnv, key: string): string => env[key]?.trim() ?? "";

export function missingGmailVars(env: NodeJS.ProcessEnv): string[] {
  return GMAIL_CREDENTIAL_VARS.filter((key) => valueOf(env, key) === "");
}


export function readGmailConfig(env: NodeJS.ProcessEnv): GmailConfig | null {
  if (missingGmailVars(env).length > 0) return null;
  return {
    credentials: {
      clientId: valueOf(env, "GMAIL_CLIENT_ID"),
      clientSecret: valueOf(env, "GMAIL_CLIENT_SECRET"),
      refreshToken: valueOf(env, "GMAIL_REFRESH_TOKEN"),
    },
    query: valueOf(env, "GMAIL_QUERY") || DEFAULT_GMAIL_QUERY,
    intervalMinutes: parseSyncInterval(env.GMAIL_SYNC_INTERVAL_MINUTES),
  };
}

export function describeGmailSetup(env: NodeJS.ProcessEnv): string {
  const missing = missingGmailVars(env);
  if (missing.length > 0) return `Gmail: deshabilitado (faltan ${missing.join(", ")})`;
  const intervalMinutes = parseSyncInterval(env.GMAIL_SYNC_INTERVAL_MINUTES);
  if (intervalMinutes !== null) return `Gmail: búsqueda automática cada ${intervalMinutes} min`;
  if (valueOf(env, "GMAIL_SYNC_INTERVAL_MINUTES") !== "") {
    return `Gmail: búsqueda manual; GMAIL_SYNC_INTERVAL_MINUTES inválido (entero ≥ ${MIN_SYNC_INTERVAL_MINUTES}), automática apagada`;
  }
  return "Gmail: búsqueda manual; automática apagada";
}
