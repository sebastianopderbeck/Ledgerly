import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { AuthConfig } from "./authConfig.js";

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleAuthUrlInput {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface GoogleExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface GoogleAuthClient {
  authUrl(input: GoogleAuthUrlInput): string;
  exchange(input: GoogleExchangeInput): Promise<GoogleIdentity>;
}

const SCOPES = ["openid", "email", "profile"];

export function createGoogleAuthClient({ googleClientId, googleClientSecret }: AuthConfig): GoogleAuthClient {
  const client = new OAuth2Client({ clientId: googleClientId, clientSecret: googleClientSecret });
  return {
    authUrl: ({ state, codeChallenge, redirectUri }) => client.generateAuthUrl({
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: "select_account",
    }),
    exchange: async ({ code, codeVerifier, redirectUri }) => {
      const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
      if (!tokens.id_token) throw new Error("Google no devolvió id_token");
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: googleClientId });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error("Google no devolvió el mail");
      return { email: payload.email, emailVerified: payload.email_verified === true, name: payload.name ?? payload.email };
    },
  };
}
