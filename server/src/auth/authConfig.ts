export interface AuthConfig {
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  ownerEmail: string;
  allowedEmails: ReadonlySet<string>;
  publicUrl: string;
}

export const MIN_SESSION_SECRET_LENGTH = 32;

const REQUIRED_VARS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "OWNER_EMAIL", "PUBLIC_URL"] as const;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const valueOf = (env: NodeJS.ProcessEnv, name: string): string => env[name]?.trim() ?? "";

const parseEmails = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map(normalizeEmail).filter((email) => email !== "");

const originOf = (raw: string): string => {
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`PUBLIC_URL inválida: ${raw}`);
  }
};

export function readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const missing = REQUIRED_VARS.filter((name) => valueOf(env, name) === "");
  if (missing.length > 0) throw new Error(`Falta configurar el login: ${missing.join(", ")}`);
  const sessionSecret = valueOf(env, "SESSION_SECRET");
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET tiene que tener al menos ${MIN_SESSION_SECRET_LENGTH} caracteres`);
  }
  const ownerEmail = normalizeEmail(valueOf(env, "OWNER_EMAIL"));
  return {
    googleClientId: valueOf(env, "GOOGLE_CLIENT_ID"),
    googleClientSecret: valueOf(env, "GOOGLE_CLIENT_SECRET"),
    sessionSecret,
    ownerEmail,
    allowedEmails: new Set([ownerEmail, ...parseEmails(env.ALLOWED_EMAILS)]),
    publicUrl: originOf(valueOf(env, "PUBLIC_URL")),
  };
}

export const isSecureOrigin = ({ publicUrl }: AuthConfig): boolean => publicUrl.startsWith("https:");

export const callbackUrl = ({ publicUrl }: AuthConfig): string => `${publicUrl}/api/auth/google/callback`;
