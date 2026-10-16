# Login y datos por usuario — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Ledgerly exija login con Google y que cada usuario vea y toque solo sus datos; todo lo que hoy está en Mongo queda del owner.

**Architecture:** Primero el login (config, sesión en cookie JWT, OAuth de Google del lado del server, middlewares y pantalla de login) sin tocar los datos, y un checkpoint manual con el cliente OAuth real. Después cada colección personal gana `userId` y cada ruta, importador y script lo pasa explícito; al final se cierra con `required: true`, un plugin de Mongoose que tira error ante una query sin `userId`, índices únicos compuestos, la suite de aislamiento A/B y el script de migración.

**Tech Stack:** Express 4 + Mongoose 8 + `google-auth-library` + `jose` + `cookie-parser`; React 18 + MUI 6 + TanStack Query 5; Vitest + supertest + mongodb-memory-server; Bun.

**Spec:** `docs/superpowers/specs/2026-10-16-login-multiusuario-design.md`

## Global Constraints

- Todo se trabaja en el worktree `.claude/worktrees/login-multiusuario`, rama `feat/login-multiusuario`. Al empezar: `bun install --frozen-lockfile` en el worktree.
- Comandos desde la raíz del worktree. Un test: `bunx vitest run <ruta>`. Todo: `bun run test`. Tipos: `bun run typecheck`.
- Cada tarea termina con tests y typecheck verdes, un commit con pathspec explícito y `git push`. Formato: `git commit -m "<tipo>(<scope>): <resumen en castellano>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <archivos>`. Nunca push a `main`, nunca PR.
- Sin comentarios en el código (ni `//`, ni bloques, ni JSDoc).
- TypeScript estricto, sin `any` escrito. Componentes React como arrow functions, props con `interface`, destructuring en la firma, lógica condicional antes del `return`, early returns para carga y error, fragments `<>…</>`.
- Tests de cliente con varios renders: `afterEach(cleanup)`.
- Ningún dato real en código, tests ni commits: mails `owner@test.dev`, `otra@test.dev`, montos sintéticos.
- Nombres exactos del spec: cookies `ledgerly_session` (30 días, `Path=/`) y `ledgerly_oauth` (10 minutos, `Path=/api/auth`); variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (≥ 32 caracteres), `OWNER_EMAIL`, `ALLOWED_EMAILS`, `PUBLIC_URL`.
- Textos exactos: 401 `Sesión vencida o inexistente`; 403 `Solo el dueño puede importar por mail`; 403 `Origen no permitido`; redirects `/?error=no-autorizado` y `/?error=login-fallido`; login «Ese mail no tiene acceso a Ledgerly» y «No se pudo entrar con Google. Probá de nuevo»; script «Falta el usuario owner: corré bun run migrate:owner».
- Un id de otro usuario responde igual que un id inexistente (mismo status que hoy da cada ruta para un id que no existe).
- `userId` en un `$match` de `aggregate` va siempre como `Types.ObjectId` (el aggregate no castea strings).

## Review Focus

1. Google devuelve el mail con mayúsculas o espacios (`Owner@Test.dev`): tiene que entrar igual y guardarse en minúsculas. Test en la Tarea 4.
2. En dev (`PUBLIC_URL=http://localhost:5173`) la cookie de sesión no puede llevar `Secure`, porque el navegador no la mandaría; con `https` sí. Test en la Tarea 4.
3. El `state` de OAuth es de un solo uso: el callback borra `ledgerly_oauth` aunque el login falle. Test en la Tarea 4.
4. La búsqueda automática de mails arranca antes de que exista el owner (merge antes de `migrate:owner`): no puede romper el server ni importar sin dueño; loguea y reintenta en el próximo slot. Test en la Tarea 10.
5. Un usuario de Google sin nombre: el avatar usa la inicial del mail. Test en la Tarea 6.

---

## Mapa de archivos

**Nuevos (server)**
- `server/src/auth/authConfig.ts` — lee y valida la config del login.
- `server/src/auth/sessionToken.ts` — firma y verifica la cookie de sesión y la de OAuth.
- `server/src/auth/users.ts` — registra un login (crea o actualiza el `User`).
- `server/src/auth/owner.ts` — busca el id del owner para scripts y la búsqueda automática.
- `server/src/auth/requireUser.ts` — middlewares `requireUser`, `requireOwner`, `checkOrigin` y helpers `currentUser`, `userIdOf`.
- `server/src/auth/googleClient.ts` — wrapper fino de `google-auth-library`.
- `server/src/auth/authRouter.ts` — `/api/auth/*`.
- `server/src/db/userScoped.ts` — plugin de guarda y `UnscopedQueryError`.
- `server/src/db/migrateOwner.ts` — script `migrate:owner`.
- `server/src/testing/auth.ts` — config y sesiones de prueba.
- `server/src/http/isolation.test.ts` — suite A/B.

**Nuevos (cliente)**
- `client/src/auth/useMe.ts`, `client/src/auth/queryClient.ts`
- `client/src/components/auth/AuthGate.tsx`, `client/src/components/auth/AuthSplash.tsx`
- `client/src/pages/LoginPage.tsx`
- `client/src/components/layout/UserMenu.tsx`

**Modificados**: `server/src/db/models.ts`, `server/src/http/app.ts`, `server/src/http/errors.ts`, `server/src/index.ts`, todas las rutas de `server/src/http/routes/`, `server/src/http/loadSubscriptions.ts`, los importadores y scripts de `server/src/import/`, `server/src/rules/seedRules.ts`, `server/src/mail/syncMail.ts`, `server/src/mail/mailJob.ts`, `shared/src/dtos.ts`, `client/src/api/client.ts`, `client/src/App.tsx`, `client/src/components/layout/TopActionsPill.tsx`, `client/src/pages/ImportPage.tsx`, `client/src/testing/renderWithProviders.tsx`, `package.json`, `server/package.json`, `README.md`, `.env.example`.

---

### Task 1: Config del login y tokens de sesión

**Files:**
- Create: `server/src/auth/authConfig.ts`, `server/src/auth/authConfig.test.ts`
- Create: `server/src/auth/sessionToken.ts`, `server/src/auth/sessionToken.test.ts`
- Modify: `server/package.json` (dependencias)

**Interfaces:**
- Produces:
  - `interface AuthConfig { googleClientId: string; googleClientSecret: string; sessionSecret: string; ownerEmail: string; allowedEmails: ReadonlySet<string>; publicUrl: string }`
  - `readAuthConfig(env: NodeJS.ProcessEnv): AuthConfig`, `normalizeEmail(email: string): string`, `isSecureOrigin(config: AuthConfig): boolean`, `callbackUrl(config: AuthConfig): string`, `MIN_SESSION_SECRET_LENGTH = 32`
  - `SESSION_COOKIE = "ledgerly_session"`, `OAUTH_COOKIE = "ledgerly_oauth"`, `OAUTH_COOKIE_PATH = "/api/auth"`, `SESSION_MAX_AGE_MS`, `OAUTH_MAX_AGE_MS`
  - `interface OAuthState { state: string; codeVerifier: string }`
  - `signSession(userId: string, secret: string, now?: Date): Promise<string>`, `verifySession(token: unknown, secret: string, now?: Date): Promise<string | null>`
  - `signOAuthState(value: OAuthState, secret: string, now?: Date): Promise<string>`, `verifyOAuthState(token: unknown, secret: string, now?: Date): Promise<OAuthState | null>`

- [ ] **Step 1: Instalar dependencias**

```bash
bun add --cwd server google-auth-library jose cookie-parser
bun add --cwd server -d @types/cookie-parser
```

Expected: `server/package.json` y `bun.lock` con las tres dependencias y el tipo.

- [ ] **Step 2: Test de la config**

`server/src/auth/authConfig.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { callbackUrl, isSecureOrigin, readAuthConfig } from "./authConfig.js";

const VALID_ENV = {
  GOOGLE_CLIENT_ID: "client-id-sintetico",
  GOOGLE_CLIENT_SECRET: "client-secret-sintetico",
  SESSION_SECRET: "s".repeat(32),
  OWNER_EMAIL: " Owner@Test.dev ",
  ALLOWED_EMAILS: "Otra@Test.dev, ,tercera@test.dev",
  PUBLIC_URL: "https://ledger.example.ts.net/",
};

const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET", "OWNER_EMAIL", "PUBLIC_URL"];

describe("readAuthConfig", () => {
  it("normaliza los mails, suma al owner a la lista y deja solo el origin de PUBLIC_URL", () => {
    const config = readAuthConfig(VALID_ENV);
    expect(config.ownerEmail).toBe("owner@test.dev");
    expect([...config.allowedEmails].sort()).toEqual(["otra@test.dev", "owner@test.dev", "tercera@test.dev"]);
    expect(config.publicUrl).toBe("https://ledger.example.ts.net");
    expect(config.sessionSecret).toBe("s".repeat(32));
  });

  it.each(REQUIRED)("falla nombrando %s si falta", (name) => {
    expect(() => readAuthConfig({ ...VALID_ENV, [name]: " " })).toThrow(`Falta configurar el login: ${name}`);
  });

  it("nombra todas las que faltan", () => {
    expect(() => readAuthConfig({})).toThrow(`Falta configurar el login: ${REQUIRED.join(", ")}`);
  });

  it("rechaza un SESSION_SECRET corto", () => {
    expect(() => readAuthConfig({ ...VALID_ENV, SESSION_SECRET: "corto" }))
      .toThrow("SESSION_SECRET tiene que tener al menos 32 caracteres");
  });

  it("rechaza una PUBLIC_URL inválida", () => {
    expect(() => readAuthConfig({ ...VALID_ENV, PUBLIC_URL: "no-es-url" })).toThrow("PUBLIC_URL inválida: no-es-url");
  });

  it("sin ALLOWED_EMAILS entra solo el owner", () => {
    const { ALLOWED_EMAILS: _omit, ...env } = VALID_ENV;
    expect([...readAuthConfig(env).allowedEmails]).toEqual(["owner@test.dev"]);
  });
});

describe("callbackUrl e isSecureOrigin", () => {
  it("arma la redirect URI desde PUBLIC_URL", () => {
    expect(callbackUrl(readAuthConfig(VALID_ENV))).toBe("https://ledger.example.ts.net/api/auth/google/callback");
  });

  it("solo https es seguro", () => {
    expect(isSecureOrigin(readAuthConfig(VALID_ENV))).toBe(true);
    expect(isSecureOrigin(readAuthConfig({ ...VALID_ENV, PUBLIC_URL: "http://localhost:5173" }))).toBe(false);
  });
});
```

- [ ] **Step 3: Correrlo y ver que falla**

Run: `bunx vitest run server/src/auth/authConfig.test.ts`
Expected: FAIL (`Failed to resolve import "./authConfig.js"`).

- [ ] **Step 4: Implementar la config**

`server/src/auth/authConfig.ts`:

```ts
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
```

- [ ] **Step 5: Test de los tokens**

`server/src/auth/sessionToken.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  OAUTH_MAX_AGE_MS, SESSION_MAX_AGE_MS, signOAuthState, signSession, verifyOAuthState, verifySession,
} from "./sessionToken.js";

const SECRET = "s".repeat(32);
const OTHER_SECRET = "o".repeat(32);
const SIGNED_AT = new Date("2026-10-16T12:00:00.000Z");
const after = (ms: number): Date => new Date(SIGNED_AT.getTime() + ms);
const tamper = (token: string): string => token.replace(/.$/, (last) => (last === "A" ? "B" : "A"));

describe("sesión", () => {
  it("firma y verifica el id del usuario", async () => {
    const token = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(token, SECRET, after(1000))).toBe("user-1");
  });

  it("vale hasta el día 30 y después no", async () => {
    const token = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(token, SECRET, after(SESSION_MAX_AGE_MS - 1000))).toBe("user-1");
    expect(await verifySession(token, SECRET, after(SESSION_MAX_AGE_MS + 1000))).toBeNull();
  });

  it("no vale firmada con otro secret ni alterada", async () => {
    const token = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(token, OTHER_SECRET, after(1000))).toBeNull();
    expect(await verifySession(tamper(token), SECRET, after(1000))).toBeNull();
  });

  it("sin cookie no hay sesión", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("", SECRET)).toBeNull();
  });
});

describe("estado de OAuth", () => {
  const STATE = { state: "estado-sintetico", codeVerifier: "verificador-sintetico" };

  it("firma y verifica state y code_verifier", async () => {
    const token = await signOAuthState(STATE, SECRET, SIGNED_AT);
    expect(await verifyOAuthState(token, SECRET, after(1000))).toEqual(STATE);
  });

  it("vence a los 10 minutos", async () => {
    const token = await signOAuthState(STATE, SECRET, SIGNED_AT);
    expect(await verifyOAuthState(token, SECRET, after(OAUTH_MAX_AGE_MS + 1000))).toBeNull();
  });

  it("un token no sirve como el otro", async () => {
    const oauth = await signOAuthState(STATE, SECRET, SIGNED_AT);
    const session = await signSession("user-1", SECRET, SIGNED_AT);
    expect(await verifySession(oauth, SECRET, after(1000))).toBeNull();
    expect(await verifyOAuthState(session, SECRET, after(1000))).toBeNull();
  });
});
```

- [ ] **Step 6: Correrlo y ver que falla**

Run: `bunx vitest run server/src/auth/sessionToken.test.ts`
Expected: FAIL (`Failed to resolve import "./sessionToken.js"`).

- [ ] **Step 7: Implementar los tokens**

`server/src/auth/sessionToken.ts`:

```ts
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ledgerly_session";
export const OAUTH_COOKIE = "ledgerly_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;

export interface OAuthState {
  state: string;
  codeVerifier: string;
}

const ALGORITHM = "HS256";

const keyOf = (secret: string): Uint8Array => new TextEncoder().encode(secret);

const epochSeconds = (ms: number): number => Math.floor(ms / 1000);

const sign = (claims: Record<string, string>, secret: string, maxAgeMs: number, now: Date): Promise<string> =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt(epochSeconds(now.getTime()))
    .setExpirationTime(epochSeconds(now.getTime() + maxAgeMs))
    .sign(keyOf(secret));

const verify = async (token: unknown, secret: string, now: Date): Promise<Record<string, unknown> | null> => {
  if (typeof token !== "string" || token === "") return null;
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), { algorithms: [ALGORITHM], currentDate: now });
    return payload;
  } catch {
    return null;
  }
};

export const signSession = (userId: string, secret: string, now: Date = new Date()): Promise<string> =>
  sign({ sub: userId }, secret, SESSION_MAX_AGE_MS, now);

export async function verifySession(token: unknown, secret: string, now: Date = new Date()): Promise<string | null> {
  const payload = await verify(token, secret, now);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

export const signOAuthState = ({ state, codeVerifier }: OAuthState, secret: string, now: Date = new Date()): Promise<string> =>
  sign({ state, codeVerifier }, secret, OAUTH_MAX_AGE_MS, now);

export async function verifyOAuthState(token: unknown, secret: string, now: Date = new Date()): Promise<OAuthState | null> {
  const payload = await verify(token, secret, now);
  const state = payload?.state;
  const codeVerifier = payload?.codeVerifier;
  return typeof state === "string" && typeof codeVerifier === "string" ? { state, codeVerifier } : null;
}
```

- [ ] **Step 8: Correr los dos tests y el typecheck**

Run: `bunx vitest run server/src/auth && bun run typecheck`
Expected: PASS, sin errores de tipos.

- [ ] **Step 9: Commit**

```bash
git add server/package.json bun.lock server/src/auth/authConfig.ts server/src/auth/authConfig.test.ts server/src/auth/sessionToken.ts server/src/auth/sessionToken.test.ts
git commit -m "feat(server): config del login y tokens de sesión" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/package.json bun.lock server/src/auth/authConfig.ts server/src/auth/authConfig.test.ts server/src/auth/sessionToken.ts server/src/auth/sessionToken.test.ts
git push
```

---

### Task 2: Usuarios y owner

**Files:**
- Modify: `server/src/db/models.ts` (agregar `userSchema`, `UserDoc`, `UserModel`)
- Create: `server/src/auth/users.ts`, `server/src/auth/users.test.ts`
- Create: `server/src/auth/owner.ts`, `server/src/auth/owner.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail` (Task 1).
- Produces:
  - `UserModel: Model<UserDoc>` con `email` (único, minúsculas), `name`, `lastLoginAt: Date | null`, `createdAt`.
  - `interface LoginRecord { user: HydratedDocument<UserDoc>; created: boolean }`, `recordLogin(email: string, name: string, now?: Date): Promise<LoginRecord>`
  - `findOwnerId(ownerEmail: string): Promise<Types.ObjectId | null>`, `requireOwnerId(env: NodeJS.ProcessEnv): Promise<Types.ObjectId>`, `MISSING_OWNER`, `MISSING_OWNER_EMAIL`

- [ ] **Step 1: Tests**

`server/src/auth/users.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { UserModel } from "../db/models.js";
import { recordLogin } from "./users.js";

withDb();

const FIRST = new Date("2026-10-16T12:00:00.000Z");
const SECOND = new Date("2026-10-17T12:00:00.000Z");

describe("recordLogin", () => {
  it("el primer login crea al usuario con el mail en minúsculas", async () => {
    const { user, created } = await recordLogin(" Owner@Test.dev ", "Owner", FIRST);
    expect(created).toBe(true);
    expect(user.email).toBe("owner@test.dev");
    expect(user.name).toBe("Owner");
    expect(user.lastLoginAt).toEqual(FIRST);
  });

  it("el segundo login actualiza nombre y fecha sin duplicar", async () => {
    const first = await recordLogin("owner@test.dev", "Owner", FIRST);
    const second = await recordLogin("OWNER@test.dev", "Owner Nuevo", SECOND);
    expect(second.created).toBe(false);
    expect(second.user._id.equals(first.user._id)).toBe(true);
    expect(second.user.name).toBe("Owner Nuevo");
    expect(second.user.lastLoginAt).toEqual(SECOND);
    expect(await UserModel.countDocuments()).toBe(1);
  });
});
```

`server/src/auth/owner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { UserModel } from "../db/models.js";
import { MISSING_OWNER, MISSING_OWNER_EMAIL, findOwnerId, requireOwnerId } from "./owner.js";

withDb();

describe("owner", () => {
  it("findOwnerId devuelve null si no existe y el id si existe", async () => {
    expect(await findOwnerId("owner@test.dev")).toBeNull();
    const owner = await UserModel.create({ email: "owner@test.dev", name: "Owner" });
    expect((await findOwnerId(" OWNER@test.dev "))?.equals(owner._id)).toBe(true);
  });

  it("requireOwnerId pide OWNER_EMAIL", async () => {
    await expect(requireOwnerId({})).rejects.toThrow(MISSING_OWNER_EMAIL);
  });

  it("requireOwnerId pide correr la migración si el owner no existe", async () => {
    await expect(requireOwnerId({ OWNER_EMAIL: "owner@test.dev" })).rejects.toThrow(MISSING_OWNER);
  });

  it("requireOwnerId devuelve el id del owner", async () => {
    const owner = await UserModel.create({ email: "owner@test.dev", name: "Owner" });
    expect((await requireOwnerId({ OWNER_EMAIL: "owner@test.dev" })).equals(owner._id)).toBe(true);
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run server/src/auth/users.test.ts server/src/auth/owner.test.ts`
Expected: FAIL (`UserModel` no existe / imports sin resolver).

- [ ] **Step 3: Modelo de usuario**

En `server/src/db/models.ts`, antes de `const statementSchema`:

```ts
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
```

Junto a los otros `export type`:

```ts
export type UserDoc = InferSchemaType<typeof userSchema>;
```

Junto a los otros modelos:

```ts
export const UserModel: Model<UserDoc> = mongoose.models.User ?? mongoose.model("User", userSchema);
```

- [ ] **Step 4: `recordLogin` y owner**

`server/src/auth/users.ts`:

```ts
import type { HydratedDocument } from "mongoose";
import { UserModel, type UserDoc } from "../db/models.js";
import { normalizeEmail } from "./authConfig.js";

export interface LoginRecord {
  user: HydratedDocument<UserDoc>;
  created: boolean;
}

export async function recordLogin(email: string, name: string, now: Date = new Date()): Promise<LoginRecord> {
  const normalized = normalizeEmail(email);
  const existing = await UserModel.findOne({ email: normalized });
  if (existing) {
    existing.name = name;
    existing.lastLoginAt = now;
    await existing.save();
    return { user: existing, created: false };
  }
  const user = await UserModel.create({ email: normalized, name, lastLoginAt: now });
  return { user, created: true };
}
```

`server/src/auth/owner.ts`:

```ts
import type { Types } from "mongoose";
import { UserModel } from "../db/models.js";
import { normalizeEmail } from "./authConfig.js";

export const MISSING_OWNER = "Falta el usuario owner: corré bun run migrate:owner";
export const MISSING_OWNER_EMAIL = "Falta OWNER_EMAIL en el .env";

export async function findOwnerId(ownerEmail: string): Promise<Types.ObjectId | null> {
  const owner = await UserModel.findOne({ email: normalizeEmail(ownerEmail) }, { _id: 1 }).lean();
  return owner?._id ?? null;
}

export async function requireOwnerId(env: NodeJS.ProcessEnv): Promise<Types.ObjectId> {
  const email = env.OWNER_EMAIL?.trim() ?? "";
  if (email === "") throw new Error(MISSING_OWNER_EMAIL);
  const ownerId = await findOwnerId(email);
  if (!ownerId) throw new Error(MISSING_OWNER);
  return ownerId;
}
```

- [ ] **Step 5: Correr tests y typecheck**

Run: `bunx vitest run server/src/auth server/src/db && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(server): usuarios y owner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/db/models.ts server/src/auth/users.ts server/src/auth/users.test.ts server/src/auth/owner.ts server/src/auth/owner.test.ts
git push
```

---

### Task 3: Middlewares de sesión, owner y origen

**Files:**
- Create: `server/src/auth/requireUser.ts`, `server/src/auth/requireUser.test.ts`
- Create: `server/src/testing/auth.ts`

**Interfaces:**
- Consumes: `AuthConfig` (Task 1), `SESSION_COOKIE`, `signSession`, `verifySession` (Task 1), `UserModel` (Task 2), `HttpError`, `asyncHandler`, `errorMiddleware` de `server/src/http/errors.ts`.
- Produces:
  - `interface SessionUser { id: Types.ObjectId; email: string; name: string; isOwner: boolean }` y `req.user?: SessionUser` (augmentation global de Express).
  - `requireUser(config: AuthConfig): RequestHandler`, `requireOwner: RequestHandler`, `checkOrigin(config: AuthConfig): RequestHandler`
  - `currentUser(req: Request): SessionUser`, `userIdOf(req: Request): Types.ObjectId`
  - `SESSION_REQUIRED`, `OWNER_ONLY`, `FOREIGN_ORIGIN`
  - En `server/src/testing/auth.ts`: `TEST_OWNER_EMAIL = "owner@test.dev"`, `TEST_OTHER_EMAIL = "otra@test.dev"`, `TEST_AUTH_CONFIG: AuthConfig`, `sessionCookieFor(userId: Types.ObjectId, config?: AuthConfig): Promise<string>` (devuelve `"ledgerly_session=<token>"`).

- [ ] **Step 1: Helper de tests**

`server/src/testing/auth.ts`:

```ts
import type { Types } from "mongoose";
import type { AuthConfig } from "../auth/authConfig.js";
import { SESSION_COOKIE, signSession } from "../auth/sessionToken.js";

export const TEST_OWNER_EMAIL = "owner@test.dev";
export const TEST_OTHER_EMAIL = "otra@test.dev";

export const TEST_AUTH_CONFIG: AuthConfig = {
  googleClientId: "client-id-sintetico",
  googleClientSecret: "client-secret-sintetico",
  sessionSecret: "secreto-de-sesion-sintetico-de-prueba",
  ownerEmail: TEST_OWNER_EMAIL,
  allowedEmails: new Set([TEST_OWNER_EMAIL, TEST_OTHER_EMAIL]),
  publicUrl: "http://localhost:5173",
};

const TEST_SESSION_ISSUED_AT = new Date("2099-01-01T00:00:00.000Z");

export const sessionCookieFor = async (userId: Types.ObjectId, config: AuthConfig = TEST_AUTH_CONFIG): Promise<string> =>
  `${SESSION_COOKIE}=${await signSession(userId.toString(), config.sessionSecret, TEST_SESSION_ISSUED_AT)}`;
```

La sesión de prueba se firma con fecha 2099 para que los tests que mueven el reloj (`vi.setSystemTime`) nunca la vean vencida.

- [ ] **Step 2: Test de los middlewares**

`server/src/auth/requireUser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, TEST_OWNER_EMAIL, sessionCookieFor } from "../testing/auth.js";
import { UserModel } from "../db/models.js";
import { errorMiddleware } from "../http/errors.js";
import { FOREIGN_ORIGIN, OWNER_ONLY, SESSION_REQUIRED, checkOrigin, currentUser, requireOwner, requireUser } from "./requireUser.js";

withDb();

const buildApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(checkOrigin(TEST_AUTH_CONFIG));
  app.get("/abierta", (_req, res) => { res.json({ ok: true }); });
  app.post("/abierta", (_req, res) => { res.json({ ok: true }); });
  app.use(requireUser(TEST_AUTH_CONFIG));
  app.get("/yo", (req, res) => {
    const { email, isOwner } = currentUser(req);
    res.json({ email, isOwner });
  });
  app.get("/solo-owner", requireOwner, (_req, res) => { res.json({ ok: true }); });
  app.use(errorMiddleware);
  return app;
};

const app = buildApp();

const cookieOf = async (email: string): Promise<string> => {
  const user = await UserModel.create({ email, name: "Prueba" });
  return sessionCookieFor(user._id);
};

describe("requireUser", () => {
  it("sin cookie responde 401", async () => {
    const res = await request(app).get("/yo");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: SESSION_REQUIRED });
  });

  it("con la cookie del owner deja pasar y marca isOwner", async () => {
    const res = await request(app).get("/yo").set("Cookie", await cookieOf(TEST_OWNER_EMAIL));
    expect(res.body).toEqual({ email: TEST_OWNER_EMAIL, isOwner: true });
  });

  it("con la cookie de otro usuario permitido, isOwner es false", async () => {
    const res = await request(app).get("/yo").set("Cookie", await cookieOf(TEST_OTHER_EMAIL));
    expect(res.body).toEqual({ email: TEST_OTHER_EMAIL, isOwner: false });
  });

  it("una cookie firmada con otro secret responde 401", async () => {
    const user = await UserModel.create({ email: TEST_OWNER_EMAIL, name: "Owner" });
    const cookie = await sessionCookieFor(user._id, { ...TEST_AUTH_CONFIG, sessionSecret: "otro-secreto-sintetico-de-prueba-xx" });
    expect((await request(app).get("/yo").set("Cookie", cookie)).status).toBe(401);
  });

  it("si el usuario ya no existe responde 401", async () => {
    const cookie = await cookieOf(TEST_OWNER_EMAIL);
    await UserModel.deleteMany({});
    expect((await request(app).get("/yo").set("Cookie", cookie)).status).toBe(401);
  });

  it("si el mail salió de la lista responde 401 aunque la cookie siga vigente", async () => {
    const res = await request(app).get("/yo").set("Cookie", await cookieOf("ex@test.dev"));
    expect(res.status).toBe(401);
  });
});

describe("requireOwner", () => {
  it("deja pasar al owner", async () => {
    const res = await request(app).get("/solo-owner").set("Cookie", await cookieOf(TEST_OWNER_EMAIL));
    expect(res.status).toBe(200);
  });

  it("a otro usuario le responde 403", async () => {
    const res = await request(app).get("/solo-owner").set("Cookie", await cookieOf(TEST_OTHER_EMAIL));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: OWNER_ONLY });
  });
});

describe("checkOrigin", () => {
  it("rechaza un POST con Origin ajeno", async () => {
    const res = await request(app).post("/abierta").set("Origin", "https://otro.example");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: FOREIGN_ORIGIN });
  });

  it("acepta un POST desde PUBLIC_URL o sin Origin", async () => {
    expect((await request(app).post("/abierta").set("Origin", TEST_AUTH_CONFIG.publicUrl)).status).toBe(200);
    expect((await request(app).post("/abierta")).status).toBe(200);
  });

  it("no mira el Origin de un GET", async () => {
    expect((await request(app).get("/abierta").set("Origin", "https://otro.example")).status).toBe(200);
  });
});
```

- [ ] **Step 3: Correrlo y ver que falla**

Run: `bunx vitest run server/src/auth/requireUser.test.ts`
Expected: FAIL (`Failed to resolve import "./requireUser.js"`).

- [ ] **Step 4: Implementar**

`server/src/auth/requireUser.ts`:

```ts
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { isValidObjectId, type Types } from "mongoose";
import { HttpError, asyncHandler } from "../http/errors.js";
import { UserModel } from "../db/models.js";
import type { AuthConfig } from "./authConfig.js";
import { SESSION_COOKIE, verifySession } from "./sessionToken.js";

export interface SessionUser {
  id: Types.ObjectId;
  email: string;
  name: string;
  isOwner: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_REQUIRED = "Sesión vencida o inexistente";
export const OWNER_ONLY = "Solo el dueño puede importar por mail";
export const FOREIGN_ORIGIN = "Origen no permitido";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireUser(config: AuthConfig): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const userId = await verifySession(req.cookies?.[SESSION_COOKIE], config.sessionSecret);
    const user = userId !== null && isValidObjectId(userId) ? await UserModel.findById(userId).lean() : null;
    if (!user || !config.allowedEmails.has(user.email)) throw new HttpError(401, SESSION_REQUIRED);
    req.user = { id: user._id, email: user.email, name: user.name, isOwner: user.email === config.ownerEmail };
    next();
  });
}

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, SESSION_REQUIRED);
  return req.user;
}

export const userIdOf = (req: Request): Types.ObjectId => currentUser(req).id;

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  next(currentUser(req).isOwner ? undefined : new HttpError(403, OWNER_ONLY));
}

export function checkOrigin({ publicUrl }: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get("origin");
    const foreign = MUTATING_METHODS.has(req.method) && origin !== undefined && origin !== publicUrl;
    next(foreign ? new HttpError(403, FOREIGN_ORIGIN) : undefined);
  };
}
```

- [ ] **Step 5: Correr y typecheck**

Run: `bunx vitest run server/src/auth && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(server): middlewares de sesión, owner y origen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/auth/requireUser.ts server/src/auth/requireUser.test.ts server/src/testing/auth.ts
git push
```

---

### Task 4: Login con Google (`/api/auth/*`) y `MeDTO`

**Files:**
- Modify: `shared/src/dtos.ts`, `shared/src/dtos.test.ts`
- Create: `server/src/auth/googleClient.ts`
- Create: `server/src/auth/authRouter.ts`, `server/src/auth/authRouter.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `meDtoSchema`, `type MeDTO = { email: string; name: string; isOwner: boolean }` en `@ledgerly/shared`.
  - `interface GoogleIdentity { email: string; emailVerified: boolean; name: string }`, `interface GoogleAuthUrlInput { state: string; codeChallenge: string; redirectUri: string }`, `interface GoogleExchangeInput { code: string; codeVerifier: string; redirectUri: string }`, `interface GoogleAuthClient { authUrl(input: GoogleAuthUrlInput): string; exchange(input: GoogleExchangeInput): Promise<GoogleIdentity> }`, `createGoogleAuthClient(config: AuthConfig): GoogleAuthClient`
  - `interface AuthRouterDeps { config: AuthConfig; google: GoogleAuthClient }`, `createAuthRouter(deps: AuthRouterDeps): Router`, `LOGIN_NOT_ALLOWED_REDIRECT = "/?error=no-autorizado"`, `LOGIN_FAILED_REDIRECT = "/?error=login-fallido"`

- [ ] **Step 1: `MeDTO` en shared (test primero)**

En `shared/src/dtos.test.ts`, sumar `meDtoSchema` al import de `./dtos.js` y al final:

```ts
describe("meDtoSchema", () => {
  it("valida al usuario logueado", () => {
    const dto = { email: "owner@test.dev", name: "Owner", isOwner: true };
    expect(meDtoSchema.parse(dto)).toEqual(dto);
  });

  it("rechaza un objeto sin mail", () => {
    expect(meDtoSchema.safeParse({ name: "Owner", isOwner: true }).success).toBe(false);
  });
});
```

Run: `bunx vitest run shared/src/dtos.test.ts` → FAIL (`meDtoSchema` no existe).

En `shared/src/dtos.ts`, después de `mailSourceStatusDtoSchema`:

```ts
export const meDtoSchema = z.object({
  email: z.string(),
  name: z.string(),
  isOwner: z.boolean(),
});
```

Y al final del archivo:

```ts
export type MeDTO = z.infer<typeof meDtoSchema>;
```

Run: `bunx vitest run shared/src/dtos.test.ts` → PASS.

- [ ] **Step 2: Wrapper de Google**

`server/src/auth/googleClient.ts` (no lleva test unitario: es un pasamanos de la librería; se valida contra Google en la Tarea 7):

```ts
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
```

- [ ] **Step 3: Test del router**

`server/src/auth/authRouter.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OWNER_EMAIL } from "../testing/auth.js";
import { UserModel } from "../db/models.js";
import { errorMiddleware } from "../http/errors.js";
import type { AuthConfig } from "./authConfig.js";
import type { GoogleAuthUrlInput, GoogleExchangeInput, GoogleIdentity } from "./googleClient.js";
import { LOGIN_FAILED_REDIRECT, LOGIN_NOT_ALLOWED_REDIRECT, createAuthRouter } from "./authRouter.js";
import { OAUTH_COOKIE, SESSION_COOKIE, verifyOAuthState, verifySession } from "./sessionToken.js";

withDb();

const OWNER: GoogleIdentity = { email: TEST_OWNER_EMAIL, emailVerified: true, name: "Owner" };
const REDIRECT_URI = "http://localhost:5173/api/auth/google/callback";

const fakeGoogle = (result: GoogleIdentity | Error) => {
  const authUrl = vi.fn(({ state, codeChallenge, redirectUri }: GoogleAuthUrlInput): string => {
    const url = new URL("https://accounts.google.test/auth");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("redirect_uri", redirectUri);
    return url.toString();
  });
  const exchange = vi.fn(async (_input: GoogleExchangeInput): Promise<GoogleIdentity> => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { authUrl, exchange };
};

const buildApp = (google: ReturnType<typeof fakeGoogle>, config: AuthConfig = TEST_AUTH_CONFIG): Express => {
  const app = express();
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter({ config, google }));
  app.use(errorMiddleware);
  return app;
};

const setCookies = (headers: Record<string, unknown>): string[] => {
  const raw = headers["set-cookie"];
  return Array.isArray(raw) ? raw.map(String) : [];
};

const cookieHeader = (headers: Record<string, unknown>, name: string): string =>
  setCookies(headers).find((cookie) => cookie.startsWith(`${name}=`)) ?? "";

const cookiePair = (headers: Record<string, unknown>, name: string): string => cookieHeader(headers, name).split(";")[0];

const login = async (app: Express, stateOverride?: string) => {
  const start = await request(app).get("/api/auth/google");
  const oauthCookie = cookiePair(start.headers, OAUTH_COOKIE);
  const state = stateOverride ?? new URL(String(start.headers.location)).searchParams.get("state") ?? "";
  const callback = await request(app)
    .get(`/api/auth/google/callback?code=codigo-sintetico&state=${state}`)
    .set("Cookie", oauthCookie);
  return { start, oauthCookie, callback };
};

describe("GET /api/auth/google", () => {
  it("redirige a Google con state, PKCE S256 y la redirect URI, y guarda el state en una cookie corta", async () => {
    const google = fakeGoogle(OWNER);
    const start = await request(buildApp(google)).get("/api/auth/google");
    expect(start.status).toBe(302);
    const header = cookieHeader(start.headers, OAUTH_COOKIE);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/api/auth");
    expect(header).toContain("Max-Age=600");
    const pending = await verifyOAuthState(cookiePair(start.headers, OAUTH_COOKIE).split("=")[1], TEST_AUTH_CONFIG.sessionSecret);
    const { state, codeChallenge, redirectUri } = google.authUrl.mock.calls[0][0];
    expect(state).toBe(pending?.state);
    expect(codeChallenge).toBe(createHash("sha256").update(pending?.codeVerifier ?? "").digest("base64url"));
    expect(redirectUri).toBe(REDIRECT_URI);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("crea al usuario, setea la sesión de 30 días y redirige a /", async () => {
    const google = fakeGoogle(OWNER);
    const { callback, oauthCookie } = await login(buildApp(google));
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe("/");
    const session = cookieHeader(callback.headers, SESSION_COOKIE);
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(session).toContain("Path=/");
    expect(session).toContain("Max-Age=2592000");
    expect(session).not.toContain("Secure");
    const user = await UserModel.findOne({ email: TEST_OWNER_EMAIL });
    const token = cookiePair(callback.headers, SESSION_COOKIE).split("=")[1];
    expect(await verifySession(token, TEST_AUTH_CONFIG.sessionSecret)).toBe(user?._id.toString());
    const pending = await verifyOAuthState(oauthCookie.split("=")[1], TEST_AUTH_CONFIG.sessionSecret);
    expect(google.exchange).toHaveBeenCalledWith({
      code: "codigo-sintetico", codeVerifier: pending?.codeVerifier, redirectUri: REDIRECT_URI,
    });
  });

  it("borra la cookie de OAuth para que el state no se pueda reusar", async () => {
    const { callback } = await login(buildApp(fakeGoogle(OWNER)));
    expect(cookieHeader(callback.headers, OAUTH_COOKIE)).toMatch(/^ledgerly_oauth=;.*Expires=Thu, 01 Jan 1970/);
  });

  it("con PUBLIC_URL https la cookie de sesión lleva Secure", async () => {
    const config = { ...TEST_AUTH_CONFIG, publicUrl: "https://ledger.example.ts.net" };
    const { callback } = await login(buildApp(fakeGoogle(OWNER), config));
    expect(cookieHeader(callback.headers, SESSION_COOKIE)).toContain("Secure");
  });

  it("acepta el mail con mayúsculas y espacios y lo guarda normalizado", async () => {
    const { callback } = await login(buildApp(fakeGoogle({ ...OWNER, email: " OWNER@Test.Dev " })));
    expect(callback.headers.location).toBe("/");
    expect(await UserModel.countDocuments({ email: TEST_OWNER_EMAIL })).toBe(1);
  });

  it("un mail fuera de la lista no crea usuario ni sesión", async () => {
    const { callback } = await login(buildApp(fakeGoogle({ ...OWNER, email: "intruso@test.dev" })));
    expect(callback.headers.location).toBe(LOGIN_NOT_ALLOWED_REDIRECT);
    expect(cookieHeader(callback.headers, SESSION_COOKIE)).toBe("");
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("un mail sin verificar es login fallido", async () => {
    const { callback } = await login(buildApp(fakeGoogle({ ...OWNER, emailVerified: false })));
    expect(callback.headers.location).toBe(LOGIN_FAILED_REDIRECT);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("un state distinto es login fallido y no canjea el código", async () => {
    const google = fakeGoogle(OWNER);
    const { callback } = await login(buildApp(google), "otro-state");
    expect(callback.headers.location).toBe(LOGIN_FAILED_REDIRECT);
    expect(google.exchange).not.toHaveBeenCalled();
    expect(cookieHeader(callback.headers, OAUTH_COOKIE)).toMatch(/^ledgerly_oauth=;/);
  });

  it("sin cookie de OAuth es login fallido", async () => {
    const res = await request(buildApp(fakeGoogle(OWNER))).get("/api/auth/google/callback?code=x&state=y");
    expect(res.headers.location).toBe(LOGIN_FAILED_REDIRECT);
  });

  it("si Google falla al canjear es login fallido", async () => {
    const { callback } = await login(buildApp(fakeGoogle(new Error("Google caído"))));
    expect(callback.headers.location).toBe(LOGIN_FAILED_REDIRECT);
  });
});

describe("GET /api/auth/me y POST /api/auth/logout", () => {
  it("me devuelve al usuario de la sesión", async () => {
    const app = buildApp(fakeGoogle(OWNER));
    const { callback } = await login(app);
    const res = await request(app).get("/api/auth/me").set("Cookie", cookiePair(callback.headers, SESSION_COOKIE));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: TEST_OWNER_EMAIL, name: "Owner", isOwner: true });
  });

  it("me sin sesión responde 401", async () => {
    expect((await request(buildApp(fakeGoogle(OWNER))).get("/api/auth/me")).status).toBe(401);
  });

  it("logout borra la cookie de sesión", async () => {
    const res = await request(buildApp(fakeGoogle(OWNER))).post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(cookieHeader(res.headers, SESSION_COOKIE)).toMatch(/^ledgerly_session=;.*Expires=Thu, 01 Jan 1970/);
  });
});
```

- [ ] **Step 4: Correrlo y ver que falla**

Run: `bunx vitest run server/src/auth/authRouter.test.ts`
Expected: FAIL (`Failed to resolve import "./authRouter.js"`).

- [ ] **Step 5: Implementar el router**

`server/src/auth/authRouter.ts`:

```ts
import { Router, type CookieOptions } from "express";
import { createHash, randomBytes } from "node:crypto";
import type { MeDTO } from "@ledgerly/shared";
import { asyncHandler } from "../http/errors.js";
import { callbackUrl, isSecureOrigin, normalizeEmail, type AuthConfig } from "./authConfig.js";
import type { GoogleAuthClient, GoogleIdentity } from "./googleClient.js";
import { currentUser, requireUser } from "./requireUser.js";
import {
  OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_MAX_AGE_MS, SESSION_COOKIE, SESSION_MAX_AGE_MS,
  signOAuthState, signSession, verifyOAuthState,
} from "./sessionToken.js";
import { recordLogin } from "./users.js";

export interface AuthRouterDeps {
  config: AuthConfig;
  google: GoogleAuthClient;
}

export const LOGIN_NOT_ALLOWED_REDIRECT = "/?error=no-autorizado";
export const LOGIN_FAILED_REDIRECT = "/?error=login-fallido";

const randomToken = (): string => randomBytes(32).toString("base64url");

const challengeOf = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export function createAuthRouter({ config, google }: AuthRouterDeps): Router {
  const router = Router();
  const cookieBase: CookieOptions = { httpOnly: true, sameSite: "lax", secure: isSecureOrigin(config) };
  const oauthCookie: CookieOptions = { ...cookieBase, path: OAUTH_COOKIE_PATH };
  const sessionCookie: CookieOptions = { ...cookieBase, path: "/" };
  const redirectUri = callbackUrl(config);

  const exchangeQuietly = (code: string, codeVerifier: string): Promise<GoogleIdentity | null> =>
    google.exchange({ code, codeVerifier, redirectUri }).catch(() => null);

  router.get("/google", asyncHandler(async (_req, res) => {
    const state = randomToken();
    const codeVerifier = randomToken();
    const token = await signOAuthState({ state, codeVerifier }, config.sessionSecret);
    res.cookie(OAUTH_COOKIE, token, { ...oauthCookie, maxAge: OAUTH_MAX_AGE_MS });
    res.redirect(google.authUrl({ state, codeChallenge: challengeOf(codeVerifier), redirectUri }));
  }));

  router.get("/google/callback", asyncHandler(async (req, res) => {
    const pending = await verifyOAuthState(req.cookies?.[OAUTH_COOKIE], config.sessionSecret);
    res.clearCookie(OAUTH_COOKIE, oauthCookie);
    const { code, state } = req.query;
    if (!pending || typeof code !== "string" || state !== pending.state) {
      res.redirect(LOGIN_FAILED_REDIRECT);
      return;
    }
    const identity = await exchangeQuietly(code, pending.codeVerifier);
    if (!identity?.emailVerified) {
      res.redirect(LOGIN_FAILED_REDIRECT);
      return;
    }
    const email = normalizeEmail(identity.email);
    if (!config.allowedEmails.has(email)) {
      res.redirect(LOGIN_NOT_ALLOWED_REDIRECT);
      return;
    }
    const { user } = await recordLogin(email, identity.name);
    const token = await signSession(user._id.toString(), config.sessionSecret);
    res.cookie(SESSION_COOKIE, token, { ...sessionCookie, maxAge: SESSION_MAX_AGE_MS });
    res.redirect("/");
  }));

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, sessionCookie);
    res.status(204).end();
  });

  router.get("/me", requireUser(config), (req, res) => {
    const { email, name, isOwner } = currentUser(req);
    const body: MeDTO = { email, name, isOwner };
    res.json(body);
  });

  return router;
}
```

- [ ] **Step 6: Correr y typecheck**

Run: `bunx vitest run server/src/auth shared/src/dtos.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(server): login con Google en /api/auth" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- shared/src/dtos.ts shared/src/dtos.test.ts server/src/auth/googleClient.ts server/src/auth/authRouter.ts server/src/auth/authRouter.test.ts
git push
```

---

### Task 5: Todo `/api` exige sesión

**Files:**
- Modify: `server/src/http/app.ts`, `server/src/index.ts`, `server/package.json` (sacar `cors`)
- Modify: `server/src/testing/auth.ts` (agregar `authedApi`, `withAuthedApi`)
- Modify: `server/src/http/app.test.ts`, `server/src/http/routes/fx.test.ts` y los otros 16 `server/src/http/routes/*.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `interface AppDeps { google?: GoogleAuthClient }`, `createApp(config: AuthConfig, deps?: AppDeps): express.Express`
  - En `server/src/testing/auth.ts`: `type AuthedApi = Record<"get" | "post" | "put" | "patch" | "delete", (url: string) => request.Test>`, `interface AuthedSession { api: AuthedApi; userId: Types.ObjectId; cookie: string }`, `authedApi(app: Express, cookie: string): AuthedApi`, `withAuthedApi(app: Express, email?: string): AuthedSession` (registra un `beforeEach` que crea al usuario después de que `withDb` vacía la base; `name` = parte local del mail).

- [ ] **Step 1: Helper de sesión para tests de rutas**

Agregar a `server/src/testing/auth.ts`:

```ts
import type { Express } from "express";
import request from "supertest";
import { beforeEach } from "vitest";
import { UserModel } from "../db/models.js";

type Method = "get" | "post" | "put" | "patch" | "delete";

export type AuthedApi = Record<Method, (url: string) => request.Test>;

export interface AuthedSession {
  api: AuthedApi;
  userId: Types.ObjectId;
  cookie: string;
}

export const authedApi = (app: Express, cookie: string): AuthedApi => ({
  get: (url) => request(app).get(url).set("Cookie", cookie),
  post: (url) => request(app).post(url).set("Cookie", cookie),
  put: (url) => request(app).put(url).set("Cookie", cookie),
  patch: (url) => request(app).patch(url).set("Cookie", cookie),
  delete: (url) => request(app).delete(url).set("Cookie", cookie),
});

export function withAuthedApi(app: Express, email: string = TEST_OWNER_EMAIL): AuthedSession {
  const session = {} as AuthedSession;
  beforeEach(async () => {
    const user = await UserModel.create({ email, name: email.split("@")[0] });
    session.userId = user._id;
    session.cookie = await sessionCookieFor(user._id);
    session.api = authedApi(app, session.cookie);
  });
  return session;
}
```

(El `import type { Types } from "mongoose"` ya está arriba del archivo; los imports nuevos van junto a los existentes.)

- [ ] **Step 2: Reescribir `app.test.ts` con los casos nuevos**

`server/src/http/app.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, TEST_OWNER_EMAIL, withAuthedApi } from "../testing/auth.js";
import { FOREIGN_ORIGIN, OWNER_ONLY, SESSION_REQUIRED } from "../auth/requireUser.js";
import { createApp } from "./app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const owner = withAuthedApi(app, TEST_OWNER_EMAIL);
const other = withAuthedApi(app, TEST_OTHER_EMAIL);

describe("createApp", () => {
  it("GET /api/health responde ok sin sesión", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("sin sesión el resto de /api responde 401", async () => {
    const res = await request(app).get("/api/statements");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: SESSION_REQUIRED });
  });

  it("una ruta inexistente responde 404 con shape de error", async () => {
    const res = await owner.api.get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/auth/me devuelve al usuario de la sesión", async () => {
    const res = await owner.api.get("/api/auth/me");
    expect(res.body).toEqual({ email: TEST_OWNER_EMAIL, name: "owner", isOwner: true });
  });

  it("solo el owner entra a /api/mail", async () => {
    const res = await other.api.get("/api/mail/status");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: OWNER_ONLY });
  });

  it("rechaza un POST desde otro origen", async () => {
    const res = await owner.api.post("/api/budgets").set("Origin", "https://otro.example").send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: FOREIGN_ORIGIN });
  });
});
```

Run: `bunx vitest run server/src/http/app.test.ts` → FAIL (`createApp` no recibe config, no hay 401).

- [ ] **Step 3: Cablear `createApp`**

`server/src/http/app.ts`: sacar `import cors from "cors";` y `app.use(cors(...))`; sumar los imports y dejar el cuerpo así (las rutas de datos no cambian de orden):

```ts
import cookieParser from "cookie-parser";
import type { AuthConfig } from "../auth/authConfig.js";
import { createAuthRouter } from "../auth/authRouter.js";
import { createGoogleAuthClient, type GoogleAuthClient } from "../auth/googleClient.js";
import { checkOrigin, requireOwner, requireUser } from "../auth/requireUser.js";

export interface AppDeps {
  google?: GoogleAuthClient;
}

export function createApp(config: AuthConfig, { google = createGoogleAuthClient(config) }: AppDeps = {}): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", checkOrigin(config));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/auth", createAuthRouter({ config, google }));
  app.use("/api", requireUser(config));
  app.use("/api/statements/:id/review", statementReviewRouter);
  app.use("/api/statements", statementsRouter);
  app.use("/api/transactions", transactionsRouter);
  app.use("/api/category-rules", categoryRulesRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/credits", creditsRouter);
  app.use("/api/auto", autoRouter);
  app.use("/api/payslips", payslipsRouter);
  app.use("/api/inflation", inflationRouter);
  app.use("/api/fx", fxRouter);
  app.use("/api/macro", macroRouter);
  app.use("/api/cash-flow", cashFlowRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/net-worth", netWorthRouter);
  app.use("/api/import", importRouter);
  app.use("/api/imports", importsRouter);
  app.use("/api/mail", requireOwner, mailRouter);
  app.use("/api/budgets", budgetsRouter);
  app.use("/api/fixed-services", fixedServicesRouter);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No encontrado")));
  app.use(errorMiddleware);
  return app;
}
```

Sacar `cors` del server:

```bash
bun remove --cwd server cors @types/cors
```

`server/src/index.ts`: importar `readAuthConfig` y leer la config antes de conectar; `createApp(authConfig)`:

```ts
import { readAuthConfig } from "./auth/authConfig.js";
```

```ts
const authConfig = readAuthConfig(process.env);
const { port, host } = resolveListenOptions(process.env);
```

```ts
const app = createApp(authConfig);
```

- [ ] **Step 4: Autenticar los tests de rutas existentes**

`fx.test.ts` no usa base hoy: reemplazar su cabecera (líneas 1–7) por:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../../fx/dollarRate.js";
import { withDb } from "../../testing/withDb.js";
import { TEST_AUTH_CONFIG, withAuthedApi } from "../../testing/auth.js";
import { createApp } from "../app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const auth = withAuthedApi(app);
```

y `request(app)` → `auth.api` en el resto del archivo.

Los otros 16 tienen la misma cabecera (`import { withDb } from "../../testing/withDb.js";`, `const app = createApp();`, `import request from "supertest";`). Correr:

```bash
for f in auto budgets cashFlow categoryRules credits fixedServices import imports macro mail netWorth statementReview statements stats subscriptions transactions; do
  file="server/src/http/routes/$f.test.ts"
  perl -0pi -e 's/(import \{ withDb \} from "\.\.\/\.\.\/testing\/withDb\.js";\n)/$1import { TEST_AUTH_CONFIG, withAuthedApi } from "..\/..\/testing\/auth.js";\n/; s/^const app = createApp\(\);$/const app = createApp(TEST_AUTH_CONFIG);\nconst auth = withAuthedApi(app);/m; s/request\(app\)/auth.api/g' "$file"
  grep -q "request(" "$file" || perl -0pi -e 's/import request from "supertest";\n//' "$file"
done
```

- [ ] **Step 5: Correr toda la suite del server y typecheck**

Run: `bunx vitest run server && bun run typecheck`
Expected: PASS. Si algún test usaba `request(app)` dentro de un `beforeAll` (antes de que exista el usuario), moverlo a `beforeEach`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(server): todo /api exige sesión y /api/mail es solo del owner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/package.json bun.lock server/src/http/app.ts server/src/index.ts server/src/testing/auth.ts server/src/http/app.test.ts server/src/http/routes
git push
```

---

### Task 6: Cliente: login, sesión vencida, menú de usuario y Mails solo para el owner

**Files:**
- Modify: `client/src/api/client.ts`, `client/src/api/client.test.ts`
- Create: `client/src/auth/useMe.ts`, `client/src/auth/queryClient.ts`, `client/src/auth/queryClient.test.ts`
- Create: `client/src/components/auth/AuthSplash.tsx`, `client/src/components/auth/AuthGate.tsx`, `client/src/components/auth/AuthGate.test.tsx`
- Create: `client/src/pages/LoginPage.tsx`
- Create: `client/src/components/layout/UserMenu.tsx`, `client/src/components/layout/UserMenu.test.tsx`
- Modify: `client/src/App.tsx`, `client/src/App.test.tsx`, `client/src/components/layout/TopActionsPill.tsx`, `client/src/pages/ImportPage.tsx`, `client/src/pages/ImportPage.test.tsx`, `client/src/testing/renderWithProviders.tsx`

**Interfaces:**
- Consumes: `MeDTO`, `meDtoSchema` (Task 4); endpoints `/api/auth/me`, `/api/auth/logout`, `/api/auth/google`.
- Produces:
  - `class UnauthorizedError extends Error` en `client/src/api/client.ts`.
  - `ME_QUERY_KEY = ["me"] as const`, `GOOGLE_LOGIN_URL = "/api/auth/google"`, `useMe(): UseQueryResult<MeDTO | null, Error>`, `useLogout(): UseMutationResult<void, Error, void>`.
  - `createAppQueryClient(): QueryClient`.
  - `renderWithProviders(ui, { route?, client? })`.

- [ ] **Step 1: `UnauthorizedError` (test primero)**

En `client/src/api/client.test.ts`, sumar `UnauthorizedError` al import y:

```ts
  it("un 401 lanza UnauthorizedError con el mensaje del backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Sesión vencida o inexistente" }), { status: 401 }),
    ));
    const error = await apiFetch("/statements").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as Error).message).toBe("Sesión vencida o inexistente");
  });
```

Run: `bunx vitest run client/src/api/client.test.ts` → FAIL.

`client/src/api/client.ts`:

```ts
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const message = body?.error ?? `Error ${res.status}`;
    throw res.status === 401 ? new UnauthorizedError(message) : new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

Run → PASS.

- [ ] **Step 2: `useMe`, `useLogout` y el `QueryClient` de la app (test primero)**

`client/src/auth/queryClient.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MutationObserver } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { UnauthorizedError } from "../api/client.js";
import { createAppQueryClient } from "./queryClient.js";
import { ME_QUERY_KEY } from "./useMe.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const failingQuery = (error: Error) => () => Promise.reject(error);

describe("createAppQueryClient", () => {
  it("un 401 en una query deja la sesión en null", async () => {
    const client = createAppQueryClient();
    client.setQueryData(ME_QUERY_KEY, OWNER_ME);
    await client.fetchQuery({ queryKey: ["resumenes"], queryFn: failingQuery(new UnauthorizedError("x")) }).catch(() => undefined);
    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it("un 401 en una mutation deja la sesión en null", async () => {
    const client = createAppQueryClient();
    client.setQueryData(ME_QUERY_KEY, OWNER_ME);
    const observer = new MutationObserver(client, { mutationFn: failingQuery(new UnauthorizedError("x")) });
    await observer.mutate().catch(() => undefined);
    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it("otro error no toca la sesión", async () => {
    const client = createAppQueryClient();
    client.setQueryData(ME_QUERY_KEY, OWNER_ME);
    await client.fetchQuery({ queryKey: ["resumenes"], queryFn: failingQuery(new Error("Mongo caído")) }).catch(() => undefined);
    expect(client.getQueryData(ME_QUERY_KEY)).toEqual(OWNER_ME);
  });
});
```

Run: `bunx vitest run client/src/auth/queryClient.test.ts` → FAIL.

`client/src/auth/useMe.ts`:

```ts
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { meDtoSchema, type MeDTO } from "@ledgerly/shared";
import { apiFetch, UnauthorizedError } from "../api/client.js";

export const ME_QUERY_KEY = ["me"] as const;
export const GOOGLE_LOGIN_URL = "/api/auth/google";

const fetchMe = async (): Promise<MeDTO | null> => {
  try {
    return meDtoSchema.parse(await apiFetch<unknown>("/auth/me"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  }
};

export const useMe = (): UseQueryResult<MeDTO | null, Error> =>
  useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: Infinity });

export const useLogout = (): UseMutationResult<void, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
};
```

`client/src/auth/queryClient.ts`:

```ts
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { UnauthorizedError } from "../api/client.js";
import { ME_QUERY_KEY } from "./useMe.js";

export const createAppQueryClient = (): QueryClient => {
  const signOutOnUnauthorized = (error: Error): void => {
    if (error instanceof UnauthorizedError) client.setQueryData(ME_QUERY_KEY, null);
  };
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    queryCache: new QueryCache({ onError: signOutOnUnauthorized }),
    mutationCache: new MutationCache({ onError: signOutOnUnauthorized }),
  });
  return client;
};
```

Run → PASS.

- [ ] **Step 3: `renderWithProviders` acepta un `QueryClient`**

`client/src/testing/renderWithProviders.tsx`:

```tsx
import { useState, type ReactElement, type ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ColorModeProvider, useColorModeState } from "../theme.js";

interface ProvidersProps {
  children: ReactNode;
  route: string;
  queryClient?: QueryClient;
}

const Providers = ({ children, route, queryClient }: ProvidersProps) => {
  const colorMode = useColorModeState();
  const [client] = useState(() => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <ColorModeProvider value={colorMode}>
      <ThemeProvider theme={colorMode.theme}>
        <CssBaseline />
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ColorModeProvider>
  );
};

interface RenderOptions {
  route?: string;
  client?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, { route = "/", client }: RenderOptions = {}): RenderResult {
  return render(<Providers route={route} queryClient={client}>{ui}</Providers>);
}
```

- [ ] **Step 4: Test del gate y el login**

`client/src/components/auth/AuthGate.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { apiFetch } from "../../api/client.js";
import { createAppQueryClient } from "../../auth/queryClient.js";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { AuthGate } from "./AuthGate.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };
const NO_SESSION = { error: "Sesión vencida o inexistente" };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (handler: (url: string) => Response | Promise<Response>) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => handler(url)));
};

const Probe = () => {
  const { isError } = useQuery({ queryKey: ["probe"], queryFn: () => apiFetch<unknown>("/statements") });
  const label = isError ? "falló" : "app";
  return <p>{label}</p>;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthGate", () => {
  it("mientras averigua la sesión muestra la marca cargando y no la app", () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(screen.getByRole("progressbar", { name: "cargando" })).toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("sin sesión muestra el botón para entrar con Google", async () => {
    stubFetch(() => respond(NO_SESSION, 401));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(await screen.findByRole("link", { name: "Entrar con Google" })).toHaveAttribute("href", "/api/auth/google");
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("con sesión muestra la app", async () => {
    stubFetch(() => respond(OWNER_ME));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(await screen.findByText("app")).toBeInTheDocument();
  });

  it.each([
    ["no-autorizado", "Ese mail no tiene acceso a Ledgerly"],
    ["login-fallido", "No se pudo entrar con Google. Probá de nuevo"],
  ])("con ?error=%s avisa «%s»", async (code, message) => {
    stubFetch(() => respond(NO_SESSION, 401));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>, { route: `/?error=${code}` });
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("si /auth/me falla muestra el error", async () => {
    stubFetch(() => respond({ error: "Mongo caído" }, 500));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });

  it("un 401 en medio de la app vuelve al login", async () => {
    stubFetch((url) => (url.endsWith("/auth/me") ? respond(OWNER_ME) : respond(NO_SESSION, 401)));
    renderWithProviders(<AuthGate><Probe /></AuthGate>, { client: createAppQueryClient() });
    expect(await screen.findByRole("link", { name: "Entrar con Google" })).toBeInTheDocument();
  });
});
```

Run: `bunx vitest run client/src/components/auth` → FAIL.

- [ ] **Step 5: Gate, splash y página de login**

`client/src/components/auth/AuthSplash.tsx`:

```tsx
import { Alert, Box, CircularProgress, Stack } from "@mui/material";
import { Brand } from "../layout/Brand.js";

interface AuthSplashProps {
  message?: string | null;
}

export const AuthSplash = ({ message = null }: AuthSplashProps) => {
  const status = message
    ? <Alert severity="error">{message}</Alert>
    : <CircularProgress aria-label="cargando" />;
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={3} alignItems="center">
        <Brand />
        {status}
      </Stack>
    </Box>
  );
};
```

`client/src/pages/LoginPage.tsx`:

```tsx
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { useSearchParams } from "react-router-dom";
import { GOOGLE_LOGIN_URL } from "../auth/useMe.js";
import { Brand } from "../components/layout/Brand.js";

const LOGIN_ERRORS = new Map([
  ["no-autorizado", "Ese mail no tiene acceso a Ledgerly"],
  ["login-fallido", "No se pudo entrar con Google. Probá de nuevo"],
]);

export const LoginPage = () => {
  const [params] = useSearchParams();
  const errorMessage = LOGIN_ERRORS.get(params.get("error") ?? "");
  const errorAlert = errorMessage ? <Alert severity="error" sx={{ width: "100%" }}>{errorMessage}</Alert> : null;
  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={3} alignItems="center" sx={{ width: "100%", maxWidth: 360 }}>
        <Brand />
        <Typography color="text.secondary" textAlign="center">Entrá con tu cuenta de Google para ver tus gastos.</Typography>
        {errorAlert}
        <Button variant="contained" size="large" fullWidth href={GOOGLE_LOGIN_URL} startIcon={<GoogleIcon />}>
          Entrar con Google
        </Button>
      </Stack>
    </Box>
  );
};
```

`client/src/components/auth/AuthGate.tsx`:

```tsx
import type { ReactNode } from "react";
import { useMe } from "../../auth/useMe.js";
import { LoginPage } from "../../pages/LoginPage.js";
import { AuthSplash } from "./AuthSplash.js";

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { data: me, isPending, isError, error } = useMe();
  if (isPending) return <AuthSplash />;
  if (isError) return <AuthSplash message={error.message} />;
  if (!me) return <LoginPage />;
  return <>{children}</>;
};
```

Run: `bunx vitest run client/src/components/auth` → PASS.

- [ ] **Step 6: Menú de usuario (test primero)**

`client/src/components/layout/UserMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MeDTO } from "@ledgerly/shared";
import { createAppQueryClient } from "../../auth/queryClient.js";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { AuthGate } from "../auth/AuthGate.js";
import { UserMenu } from "./UserMenu.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubMe = (me: MeDTO) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/auth/logout") && init?.method === "POST") return new Response(null, { status: 204 });
    return respond(me);
  }));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("muestra la inicial del nombre y, al abrirlo, el mail y Salir", async () => {
    stubMe(OWNER_ME);
    renderWithProviders(<UserMenu />);
    const button = await screen.findByRole("button", { name: "tu cuenta" });
    expect(button).toHaveTextContent("O");
    await userEvent.click(button);
    expect(screen.getByText("owner@test.dev")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Salir" })).toBeInTheDocument();
  });

  it("sin nombre usa la inicial del mail", async () => {
    stubMe({ email: "beto@test.dev", name: "  ", isOwner: false });
    renderWithProviders(<UserMenu />);
    expect(await screen.findByRole("button", { name: "tu cuenta" })).toHaveTextContent("B");
  });

  it("Salir cierra la sesión, limpia la caché y vuelve al login", async () => {
    stubMe(OWNER_ME);
    const client = createAppQueryClient();
    client.setQueryData(["statements"], [{ id: "s1" }]);
    renderWithProviders(<AuthGate><UserMenu /></AuthGate>, { client });
    await userEvent.click(await screen.findByRole("button", { name: "tu cuenta" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Salir" }));
    expect(await screen.findByRole("link", { name: "Entrar con Google" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(client.getQueryData(["statements"])).toBeUndefined();
  });
});
```

Run: `bunx vitest run client/src/components/layout/UserMenu.test.tsx` → FAIL.

`client/src/components/layout/UserMenu.tsx`:

```tsx
import { useState, type MouseEvent } from "react";
import { Avatar, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useLogout, useMe } from "../../auth/useMe.js";

const initialOf = (name: string, email: string): string => (name.trim() || email).charAt(0).toUpperCase();

export const UserMenu = () => {
  const { data: me } = useMe();
  const logout = useLogout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!me) return null;

  const open = (event: MouseEvent<HTMLElement>): void => setAnchor(event.currentTarget);
  const close = (): void => setAnchor(null);
  const exit = (): void => {
    close();
    logout.mutate();
  };

  return (
    <>
      <Tooltip title="Tu cuenta">
        <IconButton color="inherit" aria-label="tu cuenta" onClick={open}>
          <Avatar sx={{ width: 28, height: 28, fontSize: 14 }}>{initialOf(me.name, me.email)}</Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>{me.email}</Typography>
        <MenuItem onClick={exit}>Salir</MenuItem>
      </Menu>
    </>
  );
};
```

En `client/src/components/layout/TopActionsPill.tsx`: importar `UserMenu` y agregar `<UserMenu />` como último hijo del `Box`, después del botón de tema.

Run → PASS.

- [ ] **Step 7: App, Importar y sus tests**

`client/src/App.tsx`: reemplazar `const queryClient = new QueryClient(...)` por `const queryClient = createAppQueryClient();` (import desde `./auth/queryClient.js`; sacar `QueryClient` del import de react-query) y envolver el `Layout`:

```tsx
            <BrowserRouter>
              <AuthGate>
                <Layout>
                  <AnimatedRoutes />
                </Layout>
              </AuthGate>
            </BrowserRouter>
```

`client/src/App.test.tsx`, `beforeEach`:

```tsx
const OWNER_ME = { email: "owner@test.dev", name: "Owner", isOwner: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => (url.endsWith("/auth/me")
    ? Promise.resolve(new Response(JSON.stringify(OWNER_ME), { status: 200, headers: { "Content-Type": "application/json" } }))
    : new Promise<Response>(() => undefined))));
});
```

`client/src/pages/ImportPage.tsx`: importar `useMe` y, antes del `return`:

```tsx
  const { data: me } = useMe();
  const mailSection = me?.isOwner ? <MailImportSection /> : null;
```

y reemplazar `<MailImportSection />` por `{mailSection}`. (`useMe` va junto a los otros hooks, al principio del componente.)

`client/src/pages/ImportPage.test.tsx`:
- Sumar arriba:

```tsx
import { QueryClient } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { ME_QUERY_KEY } from "../auth/useMe.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const clientWithMe = (me: MeDTO): QueryClient => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY_KEY, me);
  return client;
};
```

- En `sharedDefaults`, después del chequeo de método: `if (url.endsWith("/auth/me")) return OWNER_ME;`
- En el test «la sección Mails va después…», renderizar con `renderWithProviders(<ImportPage />, { client: clientWithMe(OWNER_ME) });`.
- Test nuevo:

```tsx
  it("a quien no es owner no le muestra la sección Mails", () => {
    renderWithProviders(<ImportPage />, { client: clientWithMe({ ...OWNER_ME, isOwner: false }) });
    expect(screen.getByRole("heading", { name: "Archivos importados" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mails" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 8: Toda la suite del cliente y typecheck**

Run: `bunx vitest run client && bun run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(client): login con Google, menú de usuario y Mails solo para el owner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- client/src
git push
```

---

### Task 7: Checkpoint con el cliente OAuth real (manual, con el usuario)

Este paso lo hace el usuario con ayuda del agente. **No se sigue a la Tarea 8 sin el resultado.** Usa una base aparte, así no se escribe nada en la base real.

- [ ] **Step 1: Pedirle al usuario el cliente OAuth**

Pasos en Google Cloud Console (proyecto nuevo «Ledgerly Login», separado del de Gmail):
1. Google Auth Platform → Desarrollo de la marca: nombre «Ledgerly», mail de soporte y contacto.
2. Público: **Externo** → **Publicar app**. Acceso a los datos: solo `openid`, `email`, `profile`.
3. Clientes → Crear cliente → **Aplicación web**. Redirect URIs:
   - `http://localhost:5173/api/auth/google/callback`
   - `https://ledger.<tailnet>.ts.net/api/auth/google/callback`
   - `https://ledger.<tailnet>.ts.net:8443/api/auth/google/callback`
4. Anotar si la consola **acepta o rechaza** las URIs de `ts.net` al guardar. Si las rechaza: frenar y avisar.

- [ ] **Step 2: Probar en localhost**

Crear `<scratchpad>/login-check.env` (fuera del repo):

```
MONGO_URL=mongodb://localhost:27018/ledgerly_login_check
PORT=4000
GOOGLE_CLIENT_ID=<del paso 1>
GOOGLE_CLIENT_SECRET=<del paso 1>
SESSION_SECRET=<salida de: openssl rand -base64 48>
OWNER_EMAIL=<mail del usuario>
PUBLIC_URL=http://localhost:5173
```

Levantar server (en background, guardando el PID) y cliente:

```bash
node --env-file=<scratchpad>/login-check.env --import tsx server/src/index.ts
bun run dev:client
```

En el navegador: `http://localhost:5173` → «Entrar con Google» → elegir la cuenta del owner → vuelve a la app vacía con el avatar. Probar «Salir». Probar con otra cuenta de Google que no esté en la lista → «Ese mail no tiene acceso a Ledgerly».

- [ ] **Step 3: Probar la PWA instalada en el iPhone**

```bash
bun run build
```

Cambiar en el env `PORT=4200` y `PUBLIC_URL=https://ledger.<tailnet>.ts.net:8443`; levantar el server de nuevo (sirve `client/dist`) y publicarlo en el tailnet en otro puerto, sin tocar el servicio de :4100:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:4200
```

En el iPhone: abrir `https://ledger.<tailnet>.ts.net:8443` en Safari → Compartir → Agregar a inicio → abrir la PWA → «Entrar con Google». Anotar: ¿vuelve a la PWA logueado, o queda logueado solo en el navegador?

- [ ] **Step 4: Limpiar y reportar**

```bash
tailscale serve --https=8443 off
kill <PID del server de prueba>
docker exec ledgerly-mongo mongosh --quiet --eval 'db.getSiblingDB("ledgerly_login_check").dropDatabase()'
```

Reportarle al usuario los tres resultados (URIs de `ts.net`, localhost, PWA). Si algo falló, se ajusta el diseño antes de seguir. Si todo anduvo, seguir con la Tarea 8.

---

### Task 8: Guarda `userScoped`

**Files:**
- Create: `server/src/db/userScoped.ts`, `server/src/db/userScoped.test.ts`
- Modify: `server/src/http/errors.ts`, `server/src/http/errors.test.ts` (nuevo)

**Interfaces:**
- Produces: `class UnscopedQueryError extends Error` (mensaje `Consulta sin userId sobre <Modelo> (<operación>)`), `userScoped(schema: Schema): void`. `errorMiddleware` responde 500 `{ error: "Error interno" }` ante `UnscopedQueryError` y loguea el mensaje.

- [ ] **Step 1: Test del plugin**

`server/src/db/userScoped.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import mongoose, { Schema, Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { UnscopedQueryError, userScoped } from "./userScoped.js";

withDb();

const probeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  nombre: { type: String, required: true },
});
probeSchema.plugin(userScoped);
const ProbeModel = mongoose.models.UserScopedProbe ?? mongoose.model("UserScopedProbe", probeSchema);

const USER_ID = new Types.ObjectId();

const UNSCOPED = [
  ["find", () => ProbeModel.find({ nombre: "a" })],
  ["findOne", () => ProbeModel.findOne({ nombre: "a" })],
  ["findById", () => ProbeModel.findById(new Types.ObjectId())],
  ["findOneAndUpdate", () => ProbeModel.findOneAndUpdate({ nombre: "a" }, { nombre: "b" })],
  ["findOneAndDelete", () => ProbeModel.findOneAndDelete({ nombre: "a" })],
  ["countDocuments", () => ProbeModel.countDocuments({})],
  ["updateOne", () => ProbeModel.updateOne({ nombre: "a" }, { nombre: "b" })],
  ["updateMany", () => ProbeModel.updateMany({}, { nombre: "b" })],
  ["deleteOne", () => ProbeModel.deleteOne({ nombre: "a" })],
  ["deleteMany", () => ProbeModel.deleteMany({})],
  ["distinct", () => ProbeModel.distinct("nombre")],
  ["exists", () => ProbeModel.exists({ nombre: "a" })],
] as const;

describe("userScoped", () => {
  it.each(UNSCOPED)("%s sin userId tira UnscopedQueryError", async (_op, run) => {
    await expect(run()).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it("con userId en el filtro deja pasar", async () => {
    await ProbeModel.create({ userId: USER_ID, nombre: "a" });
    expect(await ProbeModel.countDocuments({ userId: USER_ID })).toBe(1);
    expect(await ProbeModel.findOne({ _id: { $exists: true }, userId: USER_ID })).not.toBeNull();
    expect(await ProbeModel.distinct("nombre", { userId: USER_ID })).toEqual(["a"]);
    expect((await ProbeModel.updateMany({ userId: { $exists: false } }, { userId: USER_ID })).modifiedCount).toBe(0);
  });

  it("aggregate sin $match inicial con userId tira", async () => {
    await expect(ProbeModel.aggregate([{ $group: { _id: "$nombre" } }])).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(ProbeModel.aggregate([{ $match: { nombre: "a" } }])).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it("aggregate con $match inicial con userId deja pasar", async () => {
    await ProbeModel.create({ userId: USER_ID, nombre: "a" });
    expect(await ProbeModel.aggregate([{ $match: { userId: USER_ID } }, { $count: "n" }])).toEqual([{ n: 1 }]);
  });

  it("insertar sin userId falla por validación", async () => {
    await expect(ProbeModel.create({ nombre: "a" })).rejects.toThrow(/userId/);
  });

  it("el mensaje nombra modelo y operación", async () => {
    await expect(ProbeModel.find({})).rejects.toThrow("Consulta sin userId sobre UserScopedProbe (find)");
  });
});
```

`server/src/http/errors.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { UnscopedQueryError } from "../db/userScoped.js";
import { errorMiddleware } from "./errors.js";

afterEach(() => vi.restoreAllMocks());

describe("errorMiddleware", () => {
  it("una consulta sin userId es un 500 genérico y se loguea", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express();
    app.get("/x", (_req, _res, next) => next(new UnscopedQueryError("Statement", "find")));
    app.use(errorMiddleware);
    const res = await request(app).get("/x");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Error interno" });
    expect(log).toHaveBeenCalledWith("Consulta sin userId sobre Statement (find)");
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `bunx vitest run server/src/db/userScoped.test.ts server/src/http/errors.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`server/src/db/userScoped.ts`:

```ts
import type { Aggregate, MongooseQueryMiddleware, Query, Schema } from "mongoose";

export class UnscopedQueryError extends Error {
  constructor(model: string, operation: string) {
    super(`Consulta sin userId sobre ${model} (${operation})`);
    this.name = "UnscopedQueryError";
  }
}

const SCOPED_OPERATIONS: MongooseQueryMiddleware[] = [
  "find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "countDocuments",
  "updateOne", "updateMany", "deleteOne", "deleteMany", "replaceOne", "distinct",
];

const hasUserId = (filter: Record<string, unknown> | undefined): boolean => filter?.userId !== undefined;

export function userScoped(schema: Schema): void {
  schema.pre(SCOPED_OPERATIONS, { document: false, query: true }, function guardQuery(this: Query<unknown, unknown>) {
    if (!hasUserId(this.getFilter())) throw new UnscopedQueryError(this.model.modelName, this.op ?? "query");
  });
  schema.pre("aggregate", function guardAggregate(this: Aggregate<unknown>) {
    const [first] = this.pipeline();
    const match = first && "$match" in first ? (first.$match as Record<string, unknown>) : undefined;
    if (!hasUserId(match)) throw new UnscopedQueryError(this.model().modelName, "aggregate");
  });
}
```

Si TypeScript no acepta el array con `{ document: false, query: true }`, registrar cada operación en un `for (const op of SCOPED_OPERATIONS) schema.pre(op, { document: false, query: true }, guardQuery)` con `guardQuery` como función nombrada; el comportamiento es el mismo.

`server/src/http/errors.ts`, en `errorMiddleware`, antes del 500 genérico:

```ts
  if (err instanceof UnscopedQueryError) {
    console.error(err.message);
    res.status(500).json({ error: "Error interno" });
    return;
  }
```

con `import { UnscopedQueryError } from "../db/userScoped.js";`.

- [ ] **Step 4: Correr y typecheck**

Run: `bunx vitest run server/src/db server/src/http/errors.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(server): guarda que rechaza consultas sin userId" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/db/userScoped.ts server/src/db/userScoped.test.ts server/src/http/errors.ts server/src/http/errors.test.ts
git push
```

---

### Task 9: Campo `userId` en las 14 colecciones personales

Todavía opcional y sin guarda: así cada tarea siguiente migra un dominio y la suite sigue verde. La Tarea 17 lo vuelve obligatorio.

**Files:**
- Modify: `server/src/db/models.ts`, `server/src/db/models.test.ts`

**Interfaces:**
- Produces: `userId?: Types.ObjectId | null` en `StatementDoc`, `TransactionDoc`, `CategoryRuleDoc`, `MortgageCouponDoc`, `AutoCouponDoc`, `PayslipDoc`, `HiddenSubscriptionDoc`, `ManualSubscriptionDoc`, `SubscriptionCadenceDoc`, `ManualAssetDoc`, `FixedServiceDoc`, `BudgetDoc`, `MailSyncRunDoc`, `MailAttachmentDoc`; `USER_SCOPED_MODEL_NAMES` (los 14 nombres de modelo).

- [ ] **Step 1: Test**

En `server/src/db/models.test.ts`, sumar `import mongoose from "mongoose";` y `USER_SCOPED_MODEL_NAMES` al import de `./models.js`, y:

```ts
describe("colecciones por usuario", () => {
  it("son exactamente las 14 del diseño", () => {
    expect([...USER_SCOPED_MODEL_NAMES].sort()).toEqual([
      "AutoCoupon", "Budget", "CategoryRule", "FixedService", "HiddenSubscription", "MailAttachment", "MailSyncRun",
      "ManualAsset", "ManualSubscription", "MortgageCoupon", "Payslip", "Statement", "SubscriptionCadence", "Transaction",
    ]);
  });

  it.each([...USER_SCOPED_MODEL_NAMES])("%s tiene userId indexado", (name) => {
    const path = mongoose.model(name).schema.path("userId");
    expect(path?.instance).toBe("ObjectId");
    expect(path?.options.index).toBe(true);
  });
});
```

Run: `bunx vitest run server/src/db/models.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

En `server/src/db/models.ts`, arriba de los schemas:

```ts
const userIdPath = { type: Schema.Types.ObjectId, ref: "User", index: true };
```

Agregar `userId: userIdPath,` como primer campo de: `statementSchema`, `transactionSchema`, `categoryRuleSchema`, `mortgageCouponSchema`, `autoCouponSchema`, `payslipSchema`, `hiddenSubscriptionSchema`, `manualSubscriptionSchema`, `subscriptionCadenceSchema`, `manualAssetSchema`, `fixedServiceSchema`, `budgetSchema`, `mailSyncRunSchema`, `mailAttachmentSchema`. Y al final:

```ts
export const USER_SCOPED_MODEL_NAMES = [
  "Statement", "Transaction", "CategoryRule", "MortgageCoupon", "AutoCoupon", "Payslip", "HiddenSubscription",
  "ManualSubscription", "SubscriptionCadence", "ManualAsset", "FixedService", "Budget", "MailSyncRun", "MailAttachment",
] as const;
```

- [ ] **Step 3: Suite del server y typecheck**

Run: `bunx vitest run server && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): campo userId en las colecciones personales" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/db/models.ts server/src/db/models.test.ts
git push
```

---

### Reglas comunes para las Tareas 10 a 16

Cada una migra un dominio. En el código:
- La ruta toma `const userId = userIdOf(req);` (import de `../../auth/requireUser.js`) y lo pone en **cada** filtro de un modelo personal y en **cada** documento nuevo.
- `findById(id)` → `findOne({ _id: id, userId })`; `findByIdAndUpdate(id, u, o)` → `findOneAndUpdate({ _id: id, userId }, u, o)`; `deleteOne({ _id })` → `deleteOne({ _id, userId })`.
- En `aggregate`, el primer stage es `{ $match: { userId, ... } }` con `userId` como `Types.ObjectId`.
- Los modelos compartidos (`InflationRateModel`, `MacroSeriesModel`, `UserModel`) no cambian.

En los tests del dominio:
- Tests de rutas: cada objeto que se inserta (`XModel.create`, `insertMany`, `new XModel`) lleva `userId: auth.userId`, y cada lectura directa a un modelo personal filtra por `userId: auth.userId`. Si un fixture está en una constante de módulo (`const base = {...}`), el `userId` se agrega en el lugar de uso (`{ ...base, userId: auth.userId }`), porque `auth.userId` existe recién en el `beforeEach`.
- Tests unitarios (importadores, scripts): una constante `const USER_ID = new Types.ObjectId();` (con `import { Types } from "mongoose";`) que se pasa a las funciones y se usa en fixtures y lecturas.
- Correr el archivo de test: un fixture sin `userId` aparece como «no encontrado» o con totales en 0; eso indica dónde falta.

---

### Task 10: Importación y mails por usuario

**Files:**
- Modify: `server/src/import/importStatement.ts`, `importPdf.ts`, `importCoupon.ts`, `saveCoupon.ts`, `importAutoCoupon.ts`, `importPayslip.ts`, `importCouponImage.ts`, `seedCoupons.ts`, `seedAutoCoupons.ts`, `seedPayslips.ts`
- Modify: `server/src/http/routes/import.ts`, `server/src/http/routes/statements.ts`, `server/src/http/routes/mail.ts`
- Modify: `server/src/mail/syncMail.ts`, `server/src/mail/mailJob.ts`, `server/src/index.ts`
- Tests: `server/src/import/importStatement.test.ts`, `importPdf.test.ts`, `importCoupon.test.ts`, `importAutoCoupon.test.ts`, `importCouponImage.test.ts`, `seedCoupons.test.ts`, `seedAutoCoupons.test.ts`, `seedPayslips.test.ts`, `server/src/http/routes/import.test.ts`, `statements.test.ts`, `mail.test.ts`, `server/src/mail/syncMail.test.ts`, `mailJob.test.ts`, `mailMappers.test.ts`

**Interfaces:**
- Consumes: `userIdOf` (Task 3), `findOwnerId`, `requireOwnerId`, `MISSING_OWNER` (Task 2).
- Produces:
  - `importStatement(input: { userId: Types.ObjectId; data; fileName; replace?; extracted? })`
  - `interface ImportPdfInput { userId: Types.ObjectId; data: Uint8Array; fileName: string; replace?: boolean }`
  - `mortgageCouponOutcome(result: SaveCouponResult, userId: Types.ObjectId): Promise<ImportPdfOutcome>`
  - `importCoupon`, `importAutoCoupon`, `importPayslip` reciben `userId` en el input; `SaveCouponInput.userId`; `importCouponImage(input: ImportPdfInput)`
  - `seedCoupons(dir: string, userId: Types.ObjectId)`, `seedAutoCoupons(dir, userId)`, `seedPayslips(dir, userId)`
  - `SyncMailDeps.userId: Types.ObjectId`; `runMailSync(userId: Types.ObjectId, source, openClient, trigger)`; `findLastMailRun(userId: Types.ObjectId, source)`
  - `type ResolveOwner = () => Promise<Types.ObjectId | null>`; `startMailJob(setup: MailSourceSetup, resolveOwner: ResolveOwner)`
- Desvío del spec: el spec dice que, sin owner, la corrida automática «queda registrada como error». Un `MailSyncRun` necesita `userId`, así que sin owner no hay a quién registrarla: se loguea el error con `MISSING_OWNER` y se reintenta en el próximo slot.
- Nota: la búsqueda de reglas en `importStatement` (`CategoryRuleModel.find({ enabled: true })`) no cambia acá: la mueve la Tarea 11.

- [ ] **Step 1: Ajustar los tests a la firma nueva**

```bash
for f in importStatement importPdf importCoupon importAutoCoupon importCouponImage; do
  perl -pi -e "s/\b$f\(\{/$f({ userId: USER_ID,/g" "server/src/import/$f.test.ts"
done
perl -pi -e 's/seedCoupons\(dir\)/seedCoupons(dir, USER_ID)/g' server/src/import/seedCoupons.test.ts
perl -pi -e 's/seedAutoCoupons\(dir\)/seedAutoCoupons(dir, USER_ID)/g' server/src/import/seedAutoCoupons.test.ts
perl -pi -e 's/seedPayslips\(subset\)/seedPayslips(subset, USER_ID)/g' server/src/import/seedPayslips.test.ts
perl -pi -e 's/runMailSync\("/runMailSync(USER_ID, "/g; s/findLastMailRun\("/findLastMailRun(USER_ID, "/g' server/src/mail/syncMail.test.ts
```

En cada uno de esos archivos: agregar `import { Types } from "mongoose";` (si no está) y `const USER_ID = new Types.ObjectId();` después de los imports; sumar `userId: USER_ID` a cada fixture y a cada lectura directa a un modelo personal (por ejemplo, el `MortgageCouponModel.create([...])` de `importCouponImage.test.ts` y las lecturas de `importStatement.test.ts`).

En `syncMail.test.ts`: los helpers pasan a

```ts
const gmail = (client: MailClient) => ({ userId: USER_ID, source: "gmail" as const, openClient: async () => client });
const icloud = (client: MailClient) => ({ userId: USER_ID, source: "icloud" as const, openClient: async () => client });
```

y donde se espera la llamada al importador falso, el argumento incluye `userId: USER_ID`. Los `MailAttachmentModel`/`MailSyncRunModel` que se crean o leen directo llevan `userId: USER_ID`; lo mismo en `mailMappers.test.ts`.

En `mailJob.test.ts`, después de los imports:

```ts
import { Types } from "mongoose";
import { MISSING_OWNER } from "../auth/owner.js";

const OWNER_ID = new Types.ObjectId();
const resolveOwner = vi.fn(async (): Promise<Types.ObjectId | null> => OWNER_ID);
const start = (mailSetup: MailSourceSetup) => startMailJob(mailSetup, resolveOwner);
```

`perl -pi -e 's/startMailJob\(setup/start(setup/g' server/src/mail/mailJob.test.ts`; en el `beforeEach`, `resolveOwner.mockReset(); resolveOwner.mockResolvedValue(OWNER_ID);`; las expectativas `toHaveBeenCalledWith("gmail", openClient, "job")` pasan a `toHaveBeenCalledWith(OWNER_ID, "gmail", openClient, "job")`, y las de `findLastMailRun` suman `OWNER_ID` primero. Test nuevo (dentro de `describe("startMailJob")`):

```ts
  it("sin usuario owner no corre, avisa y vuelve a intentar en el próximo slot", async () => {
    resolveOwner.mockResolvedValue(null);
    const stop = await start(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(runMailSync).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(`Gmail (automática): error — ${MISSING_OWNER}`);
    resolveOwner.mockResolvedValue(OWNER_ID);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(runMailSync).toHaveBeenCalledWith(OWNER_ID, "gmail", openClient, "job");
    stop();
  });
```

En `import.test.ts`, `statements.test.ts` y `mail.test.ts`: fixtures y lecturas con `userId: auth.userId` (reglas comunes). Test nuevo en `statements.test.ts`:

```ts
  it("guarda el resumen con el userId de la sesión", async () => {
    mocked.mockResolvedValue({ text: statementText, meta });
    const res = await auth.api.post("/api/statements").attach("file", Buffer.from("pdf"), "s.pdf");
    const stored = await StatementModel.findOne({ _id: res.body.statement.id, userId: auth.userId });
    expect(stored).not.toBeNull();
    expect(await TransactionModel.countDocuments({ statementId: stored?._id, userId: auth.userId })).toBe(res.body.transactionCount);
  });
```

(usar los nombres de mock y fixture que ya tiene el archivo; si no los tiene, copiarlos de `import.test.ts`: `vi.mock("../../pdf/extract.js", ...)`, `statementText`, `meta`.)

Run: `bunx vitest run server/src/import server/src/mail server/src/http/routes/import.test.ts server/src/http/routes/statements.test.ts server/src/http/routes/mail.test.ts`
Expected: FAIL (las funciones todavía ignoran `userId`).

- [ ] **Step 2: Importadores**

`server/src/import/importStatement.ts`:

```ts
const duplicateOf = async (userId: Types.ObjectId, statementId: Types.ObjectId): Promise<ImportStatementResult> => ({
  status: "duplicate",
  statementId: statementId.toString(),
  transactionCount: await TransactionModel.countDocuments({ userId, statementId }),
});

const removeStatement = async (userId: Types.ObjectId, statementId: Types.ObjectId): Promise<void> => {
  await TransactionModel.deleteMany({ userId, statementId });
  await StatementModel.deleteOne({ _id: statementId, userId });
};

const findSameStatement = async (userId: Types.ObjectId, header: ParsedStatement["header"]) => {
  if (!header.closingDate) return null;
  return StatementModel.findOne({
    userId,
    issuer: header.issuer,
    cardLabel: header.cardLabel,
    closingDate: new Date(header.closingDate),
  });
};
```

En `importStatement`: la firma suma `userId: Types.ObjectId;` al input; al principio `const { userId } = input;`; `StatementModel.findOne({ userId, sourceHash })`; `duplicateOf(userId, …)`; `findSameStatement(userId, statement.header)`; `statementDoc` y cada objeto de `docs` empiezan con `userId,`; `removeStatement(userId, …)` en los tres lugares; y

```ts
      (await TransactionModel.find({ userId, fingerprint: { $in: docs.map((d) => d.fingerprint) } }).distinct("fingerprint")) as string[],
```

`server/src/import/importPdf.ts`:

```ts
export interface ImportPdfInput {
  userId: Types.ObjectId;
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}
```

`KindImportInput` suma `userId: Types.ObjectId;` (con `import type { Types } from "mongoose";`). Y:

```ts
const importStatementPdf: KindImporter = async (input) => {
  const { status, statementId, transactionCount } = await importStatement(input);
  const doc = found(await StatementModel.findOne({ _id: statementId, userId: input.userId }));
  return {
    result: { kind: "statement", status, statement: toStatementDTO(doc, transactionCount), transactionCount },
    file: statementToImportedFileDTO(doc, transactionCount),
  };
};

export const mortgageCouponOutcome = async (
  { status, couponId }: SaveCouponResult, userId: Types.ObjectId,
): Promise<ImportPdfOutcome> => {
  const doc = found(await MortgageCouponModel.findOne({ _id: couponId, userId }));
  return {
    result: { kind: "coupon", status, coupon: toMortgageCouponDTO(doc) },
    file: mortgageCouponToImportedFileDTO(doc),
  };
};

const importMortgageCouponPdf: KindImporter = async (input) => mortgageCouponOutcome(await importCoupon(input), input.userId);

const importAutoCouponPdf: KindImporter = async (input) => {
  const { status, couponId } = await importAutoCoupon(input);
  const doc = found(await AutoCouponModel.findOne({ _id: couponId, userId: input.userId }));
  return {
    result: { kind: "auto", status, coupon: toAutoCouponDTO(doc) },
    file: autoCouponToImportedFileDTO(doc),
  };
};

const importPayslipPdf: KindImporter = async (input) => {
  const { status, payslipId } = await importPayslip(input);
  const doc = found(await PayslipModel.findOne({ _id: payslipId, userId: input.userId }));
  return {
    result: { kind: "payslip", status, payslip: toPayslipDTO(doc) },
    file: payslipToImportedFileDTO(doc),
  };
};

export async function importPdf({ userId, data, fileName, replace = false }: ImportPdfInput): Promise<ImportPdfOutcome> {
  const extracted = await extract(data);
  if (extracted.text.trim().length < MIN_TEXT_LENGTH) throw new NoTextError();
  const kind = detectDocumentKind(extracted.text, extracted.meta);
  if (kind === "unknown") throw new UnsupportedFormatError();
  return importers[kind]({ userId, data, fileName, replace, extracted });
}
```

`server/src/import/importCoupon.ts`: el input suma `userId: Types.ObjectId;` y
`return saveCoupon({ userId: input.userId, coupon, fileName: input.fileName, sourceHash, replace: input.replace });`

`server/src/import/saveCoupon.ts`: `SaveCouponInput` suma `userId: Types.ObjectId;`; la función desestructura `userId`; `MortgageCouponModel.findOne({ userId, prestamoNro: coupon.prestamoNro, cuotaNro: coupon.cuotaNro })`; `new MortgageCouponModel({ userId, prestamoNro: … })`; `MortgageCouponModel.deleteOne({ _id: existing._id, userId })`.

`server/src/import/importAutoCoupon.ts` y `importPayslip.ts`: el input suma `userId: Types.ObjectId;`; el `findOne` empieza con `userId: input.userId,`; `deleteOne({ _id: existing._id, userId: input.userId })`; el `create` empieza con `userId: input.userId,`.

`server/src/import/importCouponImage.ts`:

```ts
const latestCoupon = async (userId: Types.ObjectId): Promise<HydratedDocument<MortgageCouponDoc>> => {
  const latest = await MortgageCouponModel.findOne({ userId }).sort({ fechaDebito: -1 });
  if (!latest) throw new MissingPreviousCouponError();
  return latest;
};

export async function importCouponImage({ userId, data, fileName, replace = false }: ImportPdfInput): Promise<ImportPdfOutcome> {
  const image = readCoupon(toLines(await recognizeImage(data, fileName)));
  if (!totalsMatch(image)) throw new CouponImageTotalsError();
  const latest = await latestCoupon(userId);
  if (!matchesLatest(image, latest)) throw new CouponImageMismatchError();
  const { prestamoNro, tea, tna, cft } = latest;
  const coupon = toParsedCoupon(image, { prestamoNro, tea, tna, cft });
  const sourceHash = createHash("sha256").update(data).digest("hex");
  return mortgageCouponOutcome(await saveCoupon({ userId, coupon, fileName, sourceHash, replace }), userId);
}
```

(con `import type { HydratedDocument, Types } from "mongoose";`.)

Seeds: `seedCoupons(dir: string, userId: Types.ObjectId)` pasa `importCoupon({ userId, data, fileName: file })`; ídem `seedAutoCoupons` y `seedPayslips` (`importPayslip({ userId, data, fileName: file })`). En el bloque CLI de cada uno, después de `connectMongo(url)`:

```ts
  const ownerId = await requireOwnerId(process.env);
  const result = await seedCoupons(dir, ownerId);
```

(con `import { requireOwnerId } from "../auth/owner.js";` y el nombre de función que corresponda.)

- [ ] **Step 3: Rutas de importación y resúmenes**

`server/src/http/routes/import.ts`, dentro del handler:

```ts
    const { result } = await importFile({
      userId: userIdOf(req),
      data: req.file.buffer,
      fileName: req.file.originalname,
      replace: req.query.replace === "true",
    });
```

`server/src/http/routes/statements.ts`:

```ts
statementsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
    const userId = userIdOf(req);
    const replace = req.query.replace === "true";
    try {
      const result = await importStatement({ userId, data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await StatementModel.findOne({ _id: result.statementId, userId });
      const body = {
        status: result.status,
        statement: toStatementDTO(doc!, result.transactionCount),
        transactionCount: result.transactionCount,
      };
      res.status(result.status === "duplicate" ? 200 : 201).json(body);
    } catch (err) {
      if (err instanceof NoTextError || err instanceof UnsupportedFormatError || err instanceof NoTransactionsError) {
        throw new HttpError(422, err.message);
      }
      throw err;
    }
  }),
);

statementsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const docs = await StatementModel.find({ userId }).sort({ closingDate: -1 });
    const dtos = await Promise.all(
      docs.map(async (d) => toStatementDTO(d, await TransactionModel.countDocuments({ userId, statementId: d._id }))),
    );
    res.json(dtos);
  }),
);

statementsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const doc = await StatementModel.findOne({ _id: req.params.id, userId });
    if (!doc) throw new HttpError(404, "Statement no encontrado");
    const txs = await TransactionModel.find({ userId, statementId: doc._id }).sort({ date: 1 });
    res.json({
      statement: toStatementDTO(doc, txs.length),
      transactions: txs.map(toTransactionDTO),
    });
  }),
);

statementsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    await TransactionModel.deleteMany({ userId, statementId: req.params.id });
    await StatementModel.deleteOne({ _id: req.params.id, userId });
    res.status(204).end();
  }),
);
```

(El `doc!` ya estaba en el código original; se deja como está.)

- [ ] **Step 4: Mails**

`server/src/mail/syncMail.ts`:
- `SyncMailDeps` suma `userId: Types.ObjectId;` y `ScanContext` también.
- `readLedger`:

```ts
const readLedger = async (userId: Types.ObjectId, source: MailSource, ids: string[]): Promise<MailLedgerEntry[]> => {
  const docs = await MailAttachmentModel.find(
    { userId, source, messageId: { $in: ids } }, { messageId: 1, partId: 1, outcome: 1 },
  ).lean();
  return docs.map(({ messageId, partId, outcome }) => ({ messageId, partId, outcome: outcome as MailSyncOutcome }));
};
```

- `recordPart`: filtro `{ userId: ctx.userId, source: ctx.source, messageId: message.id, partId }`.
- `importPart`: `ctx.importPdf({ userId: ctx.userId, data, fileName })`.
- `scanMailbox`: `readLedger(scan.userId, scan.source, ids)`.
- El resto:

```ts
const itemsOf = (userId: Types.ObjectId, runId: Types.ObjectId) =>
  MailAttachmentModel.find({ userId, runId }).sort({ processedAt: 1, _id: 1 });

export async function syncMail({
  userId, source, openClient, trigger, importPdf = importPdfFile, maxMessages = MAIL_MAX_MESSAGES_PER_RUN, now = () => new Date(),
}: SyncMailDeps): Promise<MailSyncRunDTO> {
  const runId = new Types.ObjectId();
  const startedAt = now();
  const progress: RunProgress = { messagesChecked: 0, hasMore: false, error: null };
  let client: MailClient | null = null;
  try {
    client = await openClient();
    await scanMailbox({ userId, source, runId, client, importPdf, now }, maxMessages, progress);
  } catch (err) {
    progress.error = errorMessage(err);
  }
  await closeQuietly(client);
  const run = await MailSyncRunModel.create({
    _id: runId,
    userId,
    source,
    trigger,
    startedAt,
    finishedAt: now(),
    status: progress.error ? "error" : "ok",
    error: progress.error,
    messagesChecked: progress.messagesChecked,
    hasMore: progress.hasMore,
  });
  return toMailSyncRunDTO(run, await itemsOf(userId, runId));
}

const inFlight = new Map<string, Promise<MailSyncRunDTO>>();

export function runMailSync(
  userId: Types.ObjectId, source: MailSource, openClient: OpenMailClient, trigger: MailSyncTrigger,
): Promise<MailSyncRunDTO> {
  const key = `${userId.toString()}:${source}`;
  const current = inFlight.get(key);
  if (current) return current;
  const tracked = syncMail({ userId, source, openClient, trigger }).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, tracked);
  return tracked;
}

export async function findLastMailRun(userId: Types.ObjectId, source: MailSource): Promise<MailSyncRunDTO | null> {
  const run = await MailSyncRunModel.findOne({ userId, source }).sort({ startedAt: -1 });
  return run ? toMailSyncRunDTO(run, await itemsOf(userId, run._id)) : null;
}
```

`server/src/mail/mailJob.ts` (sumar `import type { Types } from "mongoose";` y `import { MISSING_OWNER } from "../auth/owner.js";`):

```ts
export type ResolveOwner = () => Promise<Types.ObjectId | null>;

const previousRun = async (ownerId: Types.ObjectId | null, source: MailSource): Promise<MailSyncRunDTO | null> => {
  if (!ownerId) return null;
  try {
    return await findLastMailRun(ownerId, source);
  } catch {
    return null;
  }
};

export async function startMailJob(setup: MailSourceSetup, resolveOwner: ResolveOwner): Promise<() => void> {
  const { source, schedule: mailSchedule, openClient } = setup;
  if (mailSchedule === null || openClient === null) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const jobStartedAt = new Date();
  const ownerOrNull = (): Promise<Types.ObjectId | null> => resolveOwner().catch(() => null);
  const last = await previousRun(await ownerOrNull(), source);
  let lastStartedAt: Date | null = last ? new Date(last.startedAt) : null;

  const arm = (delayMs: number): void => {
    if (stopped) return;
    timer = setTimeout(onTimer, Math.min(delayMs, MAX_TIMER_MS));
    timer.unref();
  };

  const runAsOwner = async (ownerId: Types.ObjectId | null): Promise<MailSyncRunDTO | null> => {
    if (!ownerId) {
      console.error(`${logPrefix(source, "job")}: error — ${MISSING_OWNER}`);
      return null;
    }
    try {
      const run = await runMailSync(ownerId, source, openClient, "job");
      logRun(run);
      return run;
    } catch (err) {
      console.error(`${logPrefix(source, "job")}: error — ${err instanceof Error ? err.message : UNEXPECTED_ERROR}`);
      return null;
    }
  };

  const runOnce = async (slot: Date): Promise<void> => {
    const ownerId = await ownerOrNull();
    const previous = await previousRun(ownerId, source);
    const startedAt = new Date();
    lastStartedAt = startedAt.getTime() >= slot.getTime() ? startedAt : slot;
    const run = await runAsOwner(ownerId);
    arm(nextMailRunDelayMs(mailSchedule, lastStartedAt, new Date()));
    if (run) await notifyRun(run, previous);
  };

  const onTimer = (): void => {
    const slot = nextScheduledRun(mailSchedule, lastStartedAt ?? jobStartedAt);
    const remainingMs = slot.getTime() - Date.now();
    if (remainingMs > 0) arm(remainingMs);
    else void runOnce(slot);
  };

  arm(nextMailRunDelayMs(mailSchedule, lastStartedAt, new Date()));

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
```

`server/src/http/routes/mail.ts`:

```ts
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
```

`GET /status`: `res.json(await Promise.all(setups.map(toStatus(userIdOf(req)))));` y `POST /:source/sync`: `res.json(await runMailSync(userIdOf(req), source, setup.openClient, "manual"));` (imports: `import type { Types } from "mongoose";`, `userIdOf`).

`server/src/index.ts`: `import { findOwnerId } from "./auth/owner.js";` y la última línea:

```ts
const resolveOwner = () => findOwnerId(authConfig.ownerEmail);
for (const setup of await readMailSourceSetups(process.env)) await startMailJob(setup, resolveOwner);
```

- [ ] **Step 5: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(server): importación y mails por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/import server/src/mail server/src/http/routes/import.ts server/src/http/routes/import.test.ts server/src/http/routes/statements.ts server/src/http/routes/statements.test.ts server/src/http/routes/mail.ts server/src/http/routes/mail.test.ts server/src/index.ts
git push
```

---

### Task 11: Movimientos, reglas y bandeja por usuario; reglas del sistema en el primer login

**Files:**
- Modify: `server/src/http/routes/transactions.ts`, `server/src/http/routes/categoryRules.ts`, `server/src/rules/seedRules.ts`, `server/src/import/importStatement.ts`, `server/src/import/backfillFingerprints.ts`, `server/src/auth/authRouter.ts`
- Tests: `server/src/http/routes/transactions.test.ts`, `categoryRules.test.ts`, `server/src/import/importStatement.test.ts`, `backfillFingerprints.test.ts`, `server/src/auth/authRouter.test.ts`
- Create: `server/src/rules/seedRules.test.ts`

**Interfaces:**
- Produces: `seedCategoryRules(userId: Types.ObjectId): Promise<number>`; `backfillFingerprints(userId: Types.ObjectId)`.

- [ ] **Step 1: Tests**

`server/src/rules/seedRules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { CategoryRuleModel } from "../db/models.js";
import { SEED_RULES } from "./categorize.js";
import { seedCategoryRules } from "./seedRules.js";

withDb();

const ANA = new Types.ObjectId();
const BETO = new Types.ObjectId();

describe("seedCategoryRules", () => {
  it("siembra las reglas del sistema para el usuario", async () => {
    expect(await seedCategoryRules(ANA)).toBe(SEED_RULES.length);
    expect(await CategoryRuleModel.countDocuments({ userId: ANA, source: "system" })).toBe(SEED_RULES.length);
  });

  it("es idempotente por usuario", async () => {
    await seedCategoryRules(ANA);
    expect(await seedCategoryRules(ANA)).toBe(0);
  });

  it("cada usuario tiene su copia", async () => {
    await seedCategoryRules(ANA);
    expect(await seedCategoryRules(BETO)).toBe(SEED_RULES.length);
    expect(await CategoryRuleModel.countDocuments({ userId: BETO })).toBe(SEED_RULES.length);
  });
});
```

En `server/src/auth/authRouter.test.ts`, sumar `CategoryRuleModel` al import de modelos, `import { SEED_RULES } from "../rules/categorize.js";` y:

```ts
  it("el primer login siembra las reglas del sistema una sola vez", async () => {
    const app = buildApp(fakeGoogle(OWNER));
    await login(app);
    await login(app);
    const user = await UserModel.findOne({ email: TEST_OWNER_EMAIL });
    expect(await CategoryRuleModel.countDocuments({ userId: user?._id, source: "system" })).toBe(SEED_RULES.length);
  });
```

En `importStatement.test.ts`: `seedCategoryRules()` → `seedCategoryRules(USER_ID)`. En `backfillFingerprints.test.ts`: `backfillFingerprints()` → `backfillFingerprints(USER_ID)` y fixtures/lecturas con `userId: USER_ID`. En `transactions.test.ts` y `categoryRules.test.ts`: fixtures y lecturas con `userId: auth.userId` (reglas comunes).

Run: `bunx vitest run server/src/rules server/src/auth server/src/import server/src/http/routes/transactions.test.ts server/src/http/routes/categoryRules.test.ts` → FAIL.

- [ ] **Step 2: Reglas del sistema por usuario**

`server/src/rules/seedRules.ts`:

```ts
import type { Types } from "mongoose";
import { CategoryRuleModel } from "../db/models.js";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { requireOwnerId } from "../auth/owner.js";
import { SEED_RULES } from "./categorize.js";

export async function seedCategoryRules(userId: Types.ObjectId): Promise<number> {
  let inserted = 0;
  for (const rule of SEED_RULES) {
    const exists = await CategoryRuleModel.findOne({ userId, pattern: rule.pattern, source: "system" });
    if (!exists) {
      await CategoryRuleModel.create({ ...rule, userId, source: "system", enabled: true });
      inserted += 1;
    }
  }
  return inserted;
}

if (process.argv[1]?.endsWith("seedRules.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const n = await seedCategoryRules(await requireOwnerId(process.env));
  console.log(`Reglas insertadas: ${n}`);
  await disconnectMongo();
}
```

`server/src/auth/authRouter.ts`: `import { seedCategoryRules } from "../rules/seedRules.js";` y en el callback:

```ts
    const { user, created } = await recordLogin(email, identity.name);
    if (created) await seedCategoryRules(user._id);
```

`server/src/import/importStatement.ts`: `CategoryRuleModel.find({ userId, enabled: true })`.

`server/src/import/backfillFingerprints.ts`: `backfillFingerprints(userId: Types.ObjectId)` con `TransactionModel.find({ userId })`; CLI: `const result = await backfillFingerprints(await requireOwnerId(process.env));`.

- [ ] **Step 3: Rutas**

`server/src/http/routes/transactions.ts`:

```ts
function buildFilter(q: Record<string, unknown>, userId: Types.ObjectId): FilterQuery<TransactionDoc> {
  const filter: FilterQuery<TransactionDoc> = { userId };
```

(resto igual; `import type { FilterQuery, Types } from "mongoose";`). Handlers:
- `GET /`: `const filter = buildFilter(req.query as Record<string, unknown>, userIdOf(req));`
- `GET /categories`: `TransactionModel.distinct("category", { userId: userIdOf(req) })`
- `PATCH /:id`: `TransactionModel.findOneAndUpdate({ _id: req.params.id, userId: userIdOf(req) }, update, { new: true })`
- `POST /delete`: `TransactionModel.deleteMany({ _id: { $in: ids }, userId: userIdOf(req) })`

`server/src/http/routes/categoryRules.ts`:

```ts
const categorizePending = async (userId: Types.ObjectId, ids: string[], category: string): Promise<number> => {
  if (ids.length === 0) return 0;
  const { modifiedCount } = await TransactionModel.updateMany(
    { userId, _id: { $in: ids }, category: UNCATEGORIZED },
    { category, categorySource: "rule" },
  );
  return modifiedCount;
};
```

- `GET /`: `CategoryRuleModel.find({ userId: userIdOf(req) }).sort({ priority: 1 })`
- `POST /`: `CategoryRuleModel.create({ userId: userIdOf(req), priority: …, source: "user", enabled: true })`
- `PATCH /:id`: `CategoryRuleModel.findOneAndUpdate({ _id: req.params.id, userId: userIdOf(req) }, req.body, { new: true })`
- `DELETE /:id`: `CategoryRuleModel.deleteOne({ _id: req.params.id, userId: userIdOf(req) })`
- `POST /apply`: `const userId = userIdOf(req);` → `CategoryRuleModel.find({ userId, enabled: true })`, `TransactionModel.find({ userId })`
- `GET /inbox`: `TransactionModel.find({ userId: userIdOf(req), category: UNCATEGORIZED, type: "purchase" })`
- `POST /inbox/rules`: `const userId = userIdOf(req);` → `CategoryRuleModel.create({ ...rule, userId, source: "user" })`, `TransactionModel.find({ userId, category: UNCATEGORIZED })`, `categorizePending(userId, ids, category)`

Si `req.body` del PATCH trae `userId`, el filtro ya lo acota al usuario; para que no se pueda mover una regla a otro usuario, el PATCH arma el update sin esa clave:

```ts
    const { userId: _ignored, ...changes } = req.body as Record<string, unknown>;
    const doc = await CategoryRuleModel.findOneAndUpdate({ _id: req.params.id, userId: userIdOf(req) }, changes, { new: true });
```

Test en `categoryRules.test.ts`:

```ts
  it("un PATCH no puede cambiar el dueño de la regla", async () => {
    const rule = await CategoryRuleModel.create({
      userId: auth.userId, priority: 100, matchType: "contains", pattern: "TIENDA", category: "Compras", source: "user",
    });
    await auth.api.patch(`/api/category-rules/${rule._id}`).send({ userId: "64b7f9c2a1b2c3d4e5f60718", category: "Otros" });
    expect((await CategoryRuleModel.findOne({ _id: rule._id, userId: auth.userId }))?.category).toBe("Otros");
  });
```

- [ ] **Step 4: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(server): movimientos, reglas y bandeja por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/transactions.ts server/src/http/routes/transactions.test.ts server/src/http/routes/categoryRules.ts server/src/http/routes/categoryRules.test.ts server/src/rules/seedRules.ts server/src/rules/seedRules.test.ts server/src/import/importStatement.ts server/src/import/importStatement.test.ts server/src/import/backfillFingerprints.ts server/src/import/backfillFingerprints.test.ts server/src/auth/authRouter.ts server/src/auth/authRouter.test.ts
git push
```

---

### Task 12: Stats y presupuestos por usuario

**Files:**
- Modify: `server/src/http/routes/stats.ts`, `server/src/http/routes/budgets.ts`
- Tests: `server/src/http/routes/stats.test.ts`, `budgets.test.ts`

- [ ] **Step 1: Tests**

Fixtures y lecturas con `userId: auth.userId` (reglas comunes). Test nuevo en `budgets.test.ts`:

```ts
  it("los topes de otro usuario no cuentan como duplicados", async () => {
    await BudgetModel.create({ userId: new Types.ObjectId(), category: "Comida", topeArs: 1000, periodoBase: "2026-08" });
    const created = await createBudget({ category: "Comida", topeArs: 300000 });
    expect(created.status).toBe(201);
  });
```

(con `import { Types } from "mongoose";`). Va como `it.skip`: hasta la Tarea 17 el índice único de `category` es global y el `create` choca con el tope del otro usuario. La Tarea 17 lo activa.

Run: `bunx vitest run server/src/http/routes/stats.test.ts server/src/http/routes/budgets.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

`server/src/http/routes/stats.ts` (`import type { FilterQuery, Types } from "mongoose";`, `userIdOf`):

```ts
function baseMatch(q: Record<string, unknown>, userId: Types.ObjectId): FilterQuery<TransactionDoc> {
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const match: FilterQuery<TransactionDoc> = { userId, type: "purchase", currency };
```

```ts
async function latestStatementInstallmentTxs(q: Record<string, unknown>, userId: Types.ObjectId) {
  const statementFilter = typeof q.cardLabel === "string" ? { userId, cardLabel: q.cardLabel } : { userId };
  const statements = await StatementModel.find(statementFilter).lean();
  const ids = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  return TransactionModel.find({ userId, type: "purchase", isInstallment: true, statementId: { $in: ids } }).lean();
}
```

```ts
async function installmentOccurrences(cardLabel: unknown, userId: Types.ObjectId): Promise<InstallmentOccurrence[]> {
  const statements = await StatementModel.find(typeof cardLabel === "string" ? { userId, cardLabel } : { userId }).lean();
```

y el `TransactionModel.find({ userId, type: "purchase", … })` de esa función. En los handlers:
- `/by-category`, `/monthly`, `/top-merchants`: `{ $match: baseMatch(req.query as Record<string, unknown>, userIdOf(req)) }`
- `/last-statement/by-category`: `const userId = userIdOf(req);`, `const filter: FilterQuery<StatementDoc> = { userId };`, y `{ $match: { userId, type: "purchase", currency: { $in: currencies }, statementId: { $in: ids } } }`
- `/monthly-usd`: `const filter: FilterQuery<StatementDoc> = { userId: userIdOf(req) };`
- `/future-installments` y `/future-installments/detail`: `latestStatementInstallmentTxs(req.query as Record<string, unknown>, userIdOf(req))`
- `/summary`: `const userId = userIdOf(req);`, `baseMatch(q, userId)`, `latestStatementInstallmentTxs(q, userId)`, `StatementModel.countDocuments(typeof cardLabel === "string" ? { userId, cardLabel } : { userId })`
- `/installment-purchases`: `installmentOccurrences(req.query.cardLabel, userIdOf(req))`

`server/src/http/routes/budgets.ts`:
- `GET /`: `BudgetModel.find({ userId: userIdOf(req) }).sort({ category: 1 })`
- `GET /spending`: `const userId = userIdOf(req);`, `const match: FilterQuery<TransactionDoc> = { userId, type: "purchase", currency: "ARS" };`, `StatementModel.find({ userId }, { closingDate: 1 }).lean()`
- `POST /`: `const userId = userIdOf(req);`, `BudgetModel.exists({ userId, category })`, `BudgetModel.create({ ...parsed.data, userId, periodoBase })`
- `PATCH /:id`: `BudgetModel.findOneAndUpdate({ _id: id, userId: userIdOf(req) }, { ...parsed.data, periodoBase }, { new: true })`
- `DELETE /:id`: `BudgetModel.deleteOne({ _id: id, userId: userIdOf(req) })`

- [ ] **Step 3: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): stats y presupuestos por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/stats.ts server/src/http/routes/stats.test.ts server/src/http/routes/budgets.ts server/src/http/routes/budgets.test.ts
git push
```

---

### Task 13: Créditos, auto, sueldo, archivos importados y revisión de resumen

**Files:**
- Modify: `server/src/http/routes/credits.ts`, `auto.ts`, `payslips.ts`, `imports.ts`, `statementReview.ts`
- Tests: `credits.test.ts`, `auto.test.ts`, `imports.test.ts`, `statementReview.test.ts` (`payslips` no tiene test de ruta; lo cubre la suite de la Tarea 18 vía `/api/imports`)

- [ ] **Step 1: Tests**

Fixtures y lecturas con `userId: auth.userId`. Test nuevo en `imports.test.ts`:

```ts
  it("no lista ni borra archivos de otro usuario", async () => {
    const ajeno = await PayslipModel.create({
      userId: new Types.ObjectId(), periodo: "2026-08", tipo: "mensual", fechaPago: new Date("2026-09-01"), cuil: "20-00000000-0",
      conceptos: [], remunerativo: 1, noRemunerativo: 0, descuentos: 0, brutoTotal: 1, neto: 1,
      sourceFileName: "ajeno.pdf", sourceHash: "hash-ajeno",
    });
    expect((await auth.api.get("/api/imports")).body).toEqual([]);
    expect((await auth.api.delete(`/api/imports/payslip/${ajeno._id}`)).status).toBe(404);
    expect(await PayslipModel.countDocuments({ _id: ajeno._id, userId: ajeno.userId })).toBe(1);
  });
```

Run: `bunx vitest run server/src/http/routes/credits.test.ts server/src/http/routes/auto.test.ts server/src/http/routes/imports.test.ts server/src/http/routes/statementReview.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

`credits.ts`, `auto.ts`, `payslips.ts`: en `GET /coupons` (o `GET /`) y `GET /summary`, `.find({ userId: userIdOf(req) })`; en el `PATCH`, `findOneAndUpdate({ _id: req.params.id, userId: userIdOf(req) }, { tipoCambioUsd, tipoCambioSource: "manual" }, { new: true })`.

`imports.ts`:

```ts
const countTransactionsByStatement = async (userId: Types.ObjectId): Promise<Map<string, number>> => {
  const groups = await TransactionModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { userId } },
    { $group: { _id: "$statementId", count: { $sum: 1 } } },
  ]);
  return new Map(groups.map((group) => [group._id.toString(), group.count]));
};

const deleteStatement = async (userId: Types.ObjectId, id: string): Promise<number> => {
  const { deletedCount } = await StatementModel.deleteOne({ _id: id, userId });
  if (deletedCount > 0) await TransactionModel.deleteMany({ userId, statementId: id });
  return deletedCount;
};

const deleters: Record<ImportedFileKind, (userId: Types.ObjectId, id: string) => Promise<number>> = {
  statement: deleteStatement,
  coupon: async (userId, id) => (await MortgageCouponModel.deleteOne({ _id: id, userId })).deletedCount,
  auto: async (userId, id) => (await AutoCouponModel.deleteOne({ _id: id, userId })).deletedCount,
  payslip: async (userId, id) => (await PayslipModel.deleteOne({ _id: id, userId })).deletedCount,
};

importsRouter.get("/", asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const [statements, counts, coupons, autoCoupons, payslips] = await Promise.all([
    StatementModel.find({ userId }),
    countTransactionsByStatement(userId),
    MortgageCouponModel.find({ userId }),
    AutoCouponModel.find({ userId }),
    PayslipModel.find({ userId }),
  ]);
```

(resto igual) y en el `DELETE`: `await deleters[kind.data](userIdOf(req), req.params.id)`.

`statementReview.ts`:

```ts
const findStatement = async (id: string, userId: Types.ObjectId) => {
  const statement = isValidObjectId(id) ? await StatementModel.findOne({ _id: id, userId }) : null;
  if (!statement) throw new HttpError(404, NOT_FOUND);
  return statement;
};
```

`GET /`: `const userId = userIdOf(req);`, `findStatement(req.params.id, userId)`, `StatementModel.find({ userId, issuer: statement.issuer, _id: { $ne: statement._id } })`, `TransactionModel.find({ userId, statementId: statement._id })`, `TransactionModel.find({ userId, statementId: { $in: windowIds } })`, `TransactionModel.distinct("merchant", { userId, statementId: { $in: previousIds }, type: "purchase" })`.
`PATCH /`: `StatementModel.findOneAndUpdate({ _id: id, userId: userIdOf(req) }, update, { new: true })`.

- [ ] **Step 3: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): créditos, auto, sueldo, archivos y revisión por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/credits.ts server/src/http/routes/credits.test.ts server/src/http/routes/auto.ts server/src/http/routes/auto.test.ts server/src/http/routes/payslips.ts server/src/http/routes/imports.ts server/src/http/routes/imports.test.ts server/src/http/routes/statementReview.ts server/src/http/routes/statementReview.test.ts
git push
```

---

### Task 14: Suscripciones y flujo de caja por usuario

**Files:**
- Modify: `server/src/http/loadSubscriptions.ts`, `server/src/http/routes/subscriptions.ts`, `server/src/http/routes/cashFlow.ts`
- Tests: `server/src/http/routes/subscriptions.test.ts`, `cashFlow.test.ts`

**Interfaces:**
- Produces: `loadSubscriptionInputs(hoy: string, userId: Types.ObjectId): Promise<SubscriptionInputs>`.

- [ ] **Step 1: Tests**

Fixtures y lecturas con `userId: auth.userId`. Run de los dos archivos → FAIL.

- [ ] **Step 2: Implementar**

`server/src/http/loadSubscriptions.ts`:

```ts
export async function loadSubscriptionInputs(hoy: string, userId: Types.ObjectId): Promise<SubscriptionInputs> {
  const [transactions, statements, hidden, manual, cadences] = await Promise.all([
    TransactionModel.find({ userId, isInstallment: false, type: { $in: ["purchase", "refund"] } }).lean(),
    StatementModel.find({ userId }, { issuer: 1, closingDate: 1 }).lean(),
    HiddenSubscriptionModel.find({ userId }).lean(),
    ManualSubscriptionModel.find({ userId }).lean(),
    SubscriptionCadenceModel.find({ userId }),
  ]);
```

(resto igual; `import type { Types } from "mongoose";`).

`server/src/http/routes/subscriptions.ts`:
- `GET /`: `loadSubscriptionInputs(hoy, userIdOf(req))`
- `PUT /hidden/:key`: `HiddenSubscriptionModel.updateOne({ userId: userIdOf(req), key }, { $setOnInsert: { key } }, { upsert: true })`
- `DELETE /hidden/:key`: `HiddenSubscriptionModel.deleteOne({ userId: userIdOf(req), key })`
- `POST /manual`: `const userId = userIdOf(req);`, `TransactionModel.findOne({ _id: transactionId, userId }).lean()`, `ManualSubscriptionModel.updateOne({ userId, key }, …, { upsert: true })`, `HiddenSubscriptionModel.deleteOne({ userId, key })`
- `PUT /cadence/:key`: `const userId = userIdOf(req);`, `SubscriptionCadenceModel.deleteOne({ userId, key })` / `SubscriptionCadenceModel.updateOne({ userId, key }, { $set: { cadencia } }, { upsert: true })`

`server/src/http/routes/cashFlow.ts`, en el handler (`cashFlowRouter.get("/", asyncHandler(async (req, res) => {`):

```ts
  const userId = userIdOf(req);
  const today = new Date().toISOString().slice(0, 10);
  const [
    payslips, statements, mortgageCoupons, autoCoupons, usdPoints, uvaPoints, inflationRows, lastRem, fixedServices, subscriptionInputs,
  ] = await Promise.all([
    PayslipModel.find({ userId }).lean(),
    StatementModel.find({ userId }).lean(),
    MortgageCouponModel.find({ userId }).sort({ cuotaNro: 1 }).lean(),
    AutoCouponModel.find({ userId }).sort({ cuotaNro: 1 }).lean(),
    MacroSeriesModel.find({ serie: "usd_oficial" }).sort({ fecha: 1 }).lean(),
    MacroSeriesModel.find({ serie: "uva" }).sort({ fecha: 1 }).lean(),
    InflationRateModel.find().lean(),
    MacroSeriesModel.findOne({ serie: "rem_12m" }).sort({ fecha: -1 }).lean(),
    FixedServiceModel.find({ userId }).lean(),
    loadSubscriptionInputs(today, userId),
  ]);
  const latestIds = latestStatementIdsPerIssuer(statements.map(toRecency));
  const installmentTxs = await TransactionModel.find({
    userId, statementId: { $in: latestIds }, type: "purchase", isInstallment: true, currency: "ARS",
  }).lean();
```

- [ ] **Step 3: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): suscripciones y flujo de caja por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/loadSubscriptions.ts server/src/http/routes/subscriptions.ts server/src/http/routes/subscriptions.test.ts server/src/http/routes/cashFlow.ts server/src/http/routes/cashFlow.test.ts
git push
```

---

### Task 15: Patrimonio y servicios por usuario

**Files:**
- Modify: `server/src/http/routes/netWorth.ts`, `server/src/http/routes/fixedServices.ts`
- Tests: `netWorth.test.ts`, `fixedServices.test.ts`

- [ ] **Step 1: Tests**

Fixtures y lecturas con `userId: auth.userId`. Run → FAIL.

- [ ] **Step 2: Implementar**

`netWorth.ts`:

```ts
const loadInputs = async (hoy: string, userId: Types.ObjectId): Promise<NetWorthInputs> => {
  const [autoCoupons, mortgageCoupons, statements, installments, assets, macro] = await Promise.all([
    AutoCouponModel.find({ userId }).sort({ cuotaNro: 1 }).lean(),
    MortgageCouponModel.find({ userId }).sort({ cuotaNro: 1 }).lean(),
    StatementModel.find({ userId, closingDate: { $ne: null } }).lean(),
    TransactionModel.find({ userId, type: "purchase", isInstallment: true }).lean(),
    ManualAssetModel.find({ userId }).sort({ nombre: 1 }),
    MacroSeriesModel.find({ serie: { $in: ["usd_oficial", "uva"] } }).sort({ fecha: 1 }).lean(),
  ]);
```

```ts
const findAsset = async (id: string, userId: Types.ObjectId) => {
  const doc = isValidObjectId(id) ? await ManualAssetModel.findOne({ _id: id, userId }) : null;
  if (!doc) throw new HttpError(404, ASSET_NOT_FOUND);
  return doc;
};
```

Handlers: `loadInputs(hoy, userIdOf(req))`; `ManualAssetModel.create({ userId: userIdOf(req), nombre, tipo, moneda, valuaciones: [valuacion] })`; `findAsset(req.params.id, userIdOf(req))` en el `PATCH` y en el borrado de valuación; `ManualAssetModel.deleteOne({ _id: req.params.id, userId: userIdOf(req) })`. (`import { isValidObjectId, type Types } from "mongoose";`.)

`fixedServices.ts`:

```ts
const findService = async (id: string, userId: Types.ObjectId) => {
  const doc = isValidObjectId(id) ? await FixedServiceModel.findOne({ _id: id, userId }) : null;
  if (!doc) throw new HttpError(404, SERVICE_NOT_FOUND);
  return doc;
};
```

- `GET /`: `FixedServiceModel.find({ userId: userIdOf(req) })`
- `POST /`: `FixedServiceModel.create({ userId: userIdOf(req), nombre, monto, cadencia, desde, hasta: null, montoDesde: mes })`
- `PATCH /:id`: `findService(req.params.id, userIdOf(req))`
- `DELETE /:id` (sin `doc.deleteOne()`, que la guarda de la Tarea 17 rechazaría):

```ts
fixedServicesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const doc = await findService(req.params.id, userId);
  await FixedServiceModel.deleteOne({ _id: doc._id, userId });
  res.status(204).end();
}));
```

- [ ] **Step 3: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): patrimonio y servicios por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/netWorth.ts server/src/http/routes/netWorth.test.ts server/src/http/routes/fixedServices.ts server/src/http/routes/fixedServices.test.ts
git push
```

---

### Task 16: Refresco de datos macro y cotizaciones por usuario

**Files:**
- Modify: `server/src/import/refreshRates.ts`, `refreshMacroData.ts`, `backfillRates.ts`, `backfillAutoRates.ts`, `server/src/http/routes/macro.ts`
- Tests: `server/src/import/refreshRates.test.ts`, `refreshMacroData.test.ts`, `backfillRates.test.ts`, `backfillAutoRates.test.ts`, `server/src/http/routes/macro.test.ts`

**Interfaces:**
- Produces: `refreshAllRates(userId: Types.ObjectId, resolve?: RateResolver)`, `refreshMacroData(userId: Types.ObjectId)`, `backfillCouponRates(userId: Types.ObjectId)`, `backfillAutoRates(userId: Types.ObjectId)`.

- [ ] **Step 1: Tests**

```bash
perl -pi -e 's/refreshAllRates\(/refreshAllRates(USER_ID, /g' server/src/import/refreshRates.test.ts
perl -pi -e 's/refreshMacroData\(\)/refreshMacroData(USER_ID)/g' server/src/import/refreshMacroData.test.ts
perl -pi -e 's/backfillCouponRates\(\)/backfillCouponRates(USER_ID)/g' server/src/import/backfillRates.test.ts
perl -pi -e 's/backfillAutoRates\(\)/backfillAutoRates(USER_ID)/g' server/src/import/backfillAutoRates.test.ts
```

En esos archivos: `const USER_ID = new Types.ObjectId();`, fixtures y lecturas con `userId: USER_ID`. En `refreshMacroData.test.ts`, donde se espera la llamada al mock de `refreshAllRates`, `toHaveBeenCalledWith(USER_ID)`. Test nuevo en `refreshRates.test.ts`:

```ts
  it("solo recalcula los documentos del usuario", async () => {
    const OTRO = new Types.ObjectId();
    await PayslipModel.create({
      userId: OTRO, periodo: "2026-08", tipo: "mensual", fechaPago: new Date("2026-09-01"), cuil: "20-00000000-0",
      conceptos: [], remunerativo: 1, noRemunerativo: 0, descuentos: 0, brutoTotal: 1, neto: 1,
      sourceFileName: "otro.pdf", sourceHash: "hash-otro", tipoCambioUsd: null, tipoCambioSource: null,
    });
    const result = await refreshAllRates(USER_ID, async () => 1000);
    expect(result.sueldos.updated).toBe(0);
    expect((await PayslipModel.findOne({ userId: OTRO }))?.tipoCambioUsd).toBeNull();
  });
```

En `macro.test.ts`, `POST /api/macro/refresh` sigue igual; fixtures personales con `userId: auth.userId`.

Run → FAIL.

- [ ] **Step 2: Implementar**

`refreshRates.ts`:

```ts
export async function refreshAllRates(userId: Types.ObjectId, resolve: RateResolver = createRateResolver()): Promise<RatesRefreshResult> {
  const filter = { userId, ...NOT_MANUAL };
  const [cupones, autos, sueldos] = await Promise.all([
    MortgageCouponModel.find(filter),
    AutoCouponModel.find(filter),
    PayslipModel.find(filter),
  ]);
```

`refreshMacroData.ts`: `export async function refreshMacroData(userId: Types.ObjectId)` y `const tipoCambio = await refreshAllRates(userId);`.

`backfillRates.ts`: `backfillCouponRates(userId: Types.ObjectId)` con `MortgageCouponModel.find({ userId, tipoCambioUsd: null })`; CLI `await backfillCouponRates(await requireOwnerId(process.env))`. Ídem `backfillAutoRates.ts` con `AutoCouponModel`.

`macro.ts`: `macroRouter.post("/refresh", asyncHandler(async (req, res) => { res.json(await refreshMacroData(userIdOf(req))); }));`

- [ ] **Step 3: Correr y typecheck**

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): refresco de cotizaciones por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/import/refreshRates.ts server/src/import/refreshRates.test.ts server/src/import/refreshMacroData.ts server/src/import/refreshMacroData.test.ts server/src/import/backfillRates.ts server/src/import/backfillRates.test.ts server/src/import/backfillAutoRates.ts server/src/import/backfillAutoRates.test.ts server/src/http/routes/macro.ts server/src/http/routes/macro.test.ts
git push
```

---

### Task 17: Cierre: `userId` obligatorio, guarda activa e índices por usuario

**Files:**
- Modify: `server/src/db/models.ts`, `server/src/db/models.test.ts`, `server/src/http/routes/budgets.test.ts` (activar el `it.skip`)
- Modify: cualquier archivo que la suite marque (lecturas sin `userId` que quedaron)

**Interfaces:**
- Consumes: `userScoped` (Task 8), `userIdPath` y `USER_SCOPED_MODEL_NAMES` (Task 9).
- Produces: `userId: Types.ObjectId` requerido en los 14 `*Doc`; índices únicos compuestos del spec.

- [ ] **Step 1: Tests**

En `server/src/db/models.test.ts`:
- Todo `create` de un modelo personal lleva `userId` (una constante `const USER_ID = new Types.ObjectId();`).
- El test «rechaza sourceHash duplicado» crea los dos con el mismo `USER_ID`.
- Tests nuevos:

```ts
describe("unicidad por usuario", () => {
  it.each([...USER_SCOPED_MODEL_NAMES])("%s exige userId", (name) => {
    const Model = mongoose.model(name);
    expect(new Model({}).validateSync()?.errors.userId).toBeDefined();
  });

  it("el mismo sourceHash en dos usuarios se acepta", async () => {
    const statement = (userId: Types.ObjectId) => ({
      userId, issuer: "icbc" as const, cardLabel: "ICBC", last4: null, closingDate: new Date(), dueDate: new Date(),
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "mismo", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await StatementModel.init();
    await StatementModel.create(statement(new Types.ObjectId()));
    await expect(StatementModel.create(statement(new Types.ObjectId()))).resolves.toBeDefined();
  });

  it("los índices únicos empiezan por userId", async () => {
    const expected: Record<string, string[]> = {
      Statement: ["userId", "sourceHash"],
      MortgageCoupon: ["userId", "prestamoNro", "cuotaNro"],
      AutoCoupon: ["userId", "grupo", "orden", "cuotaNro"],
      Payslip: ["userId", "cuil", "periodo", "tipo"],
      HiddenSubscription: ["userId", "key"],
      ManualSubscription: ["userId", "key"],
      SubscriptionCadence: ["userId", "key"],
      Budget: ["userId", "category"],
      MailAttachment: ["userId", "source", "messageId", "partId"],
    };
    for (const [name, keys] of Object.entries(expected)) {
      const unique = mongoose.model(name).schema.indexes().filter(([, options]) => options?.unique === true);
      expect(unique.map(([fields]) => Object.keys(fields))).toEqual([keys]);
    }
  });
});
```

En `budgets.test.ts`, `it.skip("los topes de otro usuario…"` → `it(`.

Run: `bunx vitest run server/src/db/models.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

En `server/src/db/models.ts`:

```ts
import { userScoped } from "./userScoped.js";

const userIdPath = { type: Schema.Types.ObjectId, ref: "User", required: true as const, index: true };
```

Quitar `unique: true` de `statementSchema.sourceHash`, de `key` en `hiddenSubscriptionSchema`, `manualSubscriptionSchema`, `subscriptionCadenceSchema`, y de `budgetSchema.category`. Reemplazar los índices:

```ts
statementSchema.index({ userId: 1, sourceHash: 1 }, { unique: true });
mortgageCouponSchema.index({ userId: 1, prestamoNro: 1, cuotaNro: 1 }, { unique: true });
autoCouponSchema.index({ userId: 1, grupo: 1, orden: 1, cuotaNro: 1 }, { unique: true });
payslipSchema.index({ userId: 1, cuil: 1, periodo: 1, tipo: 1 }, { unique: true });
hiddenSubscriptionSchema.index({ userId: 1, key: 1 }, { unique: true });
manualSubscriptionSchema.index({ userId: 1, key: 1 }, { unique: true });
subscriptionCadenceSchema.index({ userId: 1, key: 1 }, { unique: true });
budgetSchema.index({ userId: 1, category: 1 }, { unique: true });
mailSyncRunSchema.index({ userId: 1, source: 1, startedAt: -1 });
mailAttachmentSchema.index({ userId: 1, source: 1, messageId: 1, partId: 1 }, { unique: true });
```

(borrando los `index(...)` viejos de esas colecciones). Y antes de compilar los modelos:

```ts
[
  statementSchema, transactionSchema, categoryRuleSchema, mortgageCouponSchema, autoCouponSchema, payslipSchema,
  hiddenSubscriptionSchema, manualSubscriptionSchema, subscriptionCadenceSchema, manualAssetSchema, fixedServiceSchema,
  budgetSchema, mailSyncRunSchema, mailAttachmentSchema,
].forEach((schema) => schema.plugin(userScoped));
```

- [ ] **Step 3: Correr toda la suite y arreglar lo que la guarda marque**

Run: `bunx vitest run server`
Expected: puede haber fallas `UnscopedQueryError` o de validación `userId` en tests que leen o crean modelos sin `userId` (por ejemplo `mappers.test.ts`). Cada una se arregla agregando `userId` donde falta (reglas comunes). Si una falla viene de código de producción, es un filtro que quedó sin `userId`: agregarlo. Repetir hasta verde.

Run: `bun run test && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): userId obligatorio, guarda activa e índices por usuario" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src
git push
```

---

### Task 18: Suite de aislamiento A/B

**Files:**
- Create: `server/src/http/isolation.test.ts`

- [ ] **Step 1: Escribir la suite**

`server/src/http/isolation.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("../pdf/extract.js", () => ({ extractPdfText: vi.fn() }));
import { extractPdfText } from "../pdf/extract.js";
import { withDb } from "../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, TEST_OWNER_EMAIL, withAuthedApi, type AuthedSession } from "../testing/auth.js";
import { OWNER_ONLY } from "../auth/requireUser.js";
import { createApp } from "./app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const ana = withAuthedApi(app, TEST_OWNER_EMAIL);
const beto = withAuthedApi(app, TEST_OTHER_EMAIL);

const statementText = readFileSync(
  fileURLToPath(new URL("../parsers/__fixtures__/icbc.sample.txt", import.meta.url)), "utf8",
);
const meta = { producer: null, creator: null, pageCount: 1, encrypted: false };

const importStatement = async (session: AuthedSession) => {
  vi.mocked(extractPdfText).mockResolvedValue({ text: statementText, meta });
  return session.api.post("/api/import").attach("file", Buffer.from("mismo-pdf"), "resumen.pdf");
};

describe("aislamiento entre usuarios", () => {
  it("los dos importan el mismo PDF y cada uno queda imported", async () => {
    const first = await importStatement(ana);
    const second = await importStatement(beto);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.status).toBe("imported");
  });

  it("B no ve ni toca los resúmenes y movimientos de A", async () => {
    const imported = await importStatement(ana);
    const statementId = imported.body.statement.id;
    const anaTxs = (await ana.api.get("/api/transactions")).body;
    const txId = anaTxs.items[0].id;

    expect((await beto.api.get("/api/statements")).body).toEqual([]);
    expect((await beto.api.get(`/api/statements/${statementId}`)).status).toBe(404);
    expect((await beto.api.get(`/api/statements/${statementId}/review`)).status).toBe(404);
    expect((await beto.api.delete(`/api/imports/statement/${statementId}`)).status).toBe(404);
    await beto.api.delete(`/api/statements/${statementId}`);
    expect((await beto.api.get("/api/transactions")).body.total).toBe(0);
    expect((await beto.api.patch(`/api/transactions/${txId}`).send({ category: "Otros" })).status).toBe(404);
    expect((await beto.api.post("/api/transactions/delete").send({ ids: [txId] })).body).toEqual({ deleted: 0 });
    expect((await beto.api.get("/api/stats/summary")).body).toMatchObject({ transactionCount: 0, statementCount: 0 });
    expect((await beto.api.get("/api/imports")).body).toEqual([]);

    expect((await ana.api.get(`/api/statements/${statementId}`)).status).toBe(200);
    expect((await ana.api.get("/api/transactions")).body.total).toBe(anaTxs.total);
  });

  it("presupuestos, servicios, activos y reglas son de cada uno", async () => {
    const budget = (await ana.api.post("/api/budgets").send({ category: "Comida", topeArs: 300000 })).body;
    const service = (await ana.api.post("/api/fixed-services").send({ nombre: "Luz", monto: 1000 })).body;
    const asset = (await ana.api.post("/api/net-worth/assets").send({
      nombre: "Caja", tipo: "cuenta", moneda: "ARS", valuacion: { fecha: "2026-10-01", monto: 1000 },
    })).body;
    const rule = (await ana.api.post("/api/category-rules").send({ pattern: "TIENDA", category: "Compras" })).body;

    expect((await beto.api.get("/api/budgets")).body).toEqual([]);
    expect((await beto.api.get("/api/fixed-services")).body).toEqual([]);
    expect((await beto.api.get("/api/category-rules")).body.map((r: { id: string }) => r.id)).not.toContain(rule.id);

    expect((await beto.api.patch(`/api/budgets/${budget.id}`).send({ topeArs: 1 })).status).toBe(404);
    expect((await beto.api.delete(`/api/budgets/${budget.id}`)).status).toBe(404);
    expect((await beto.api.patch(`/api/fixed-services/${service.id}`).send({ monto: 1 })).status).toBe(404);
    expect((await beto.api.delete(`/api/fixed-services/${service.id}`)).status).toBe(404);
    expect((await beto.api.patch(`/api/net-worth/assets/${asset.id}`).send({ nombre: "X" })).status).toBe(404);
    expect((await beto.api.patch(`/api/category-rules/${rule.id}`).send({ category: "Otros" })).status).toBe(404);

    expect((await beto.api.post("/api/budgets").send({ category: "Comida", topeArs: 1000 })).status).toBe(201);
    expect((await ana.api.get("/api/budgets")).body).toEqual([budget]);
  });

  it("las suscripciones ocultas de uno no chocan con las del otro", async () => {
    expect((await ana.api.put("/api/subscriptions/hidden/netflix")).status).toBe(204);
    expect((await beto.api.put("/api/subscriptions/hidden/netflix")).status).toBe(204);
  });

  it("solo el owner usa los mails", async () => {
    expect((await beto.api.get("/api/mail/status")).body).toEqual({ error: OWNER_ONLY });
    expect((await beto.api.post("/api/mail/gmail/sync")).status).toBe(403);
  });
});
```

Los cuerpos de alta cumplen `budgetInputSchema`, `fixedServiceCreateSchema` y `manualAssetCreateSchema` de `shared/src/dtos.ts`.

- [ ] **Step 2: Correrla**

Run: `bunx vitest run server/src/http/isolation.test.ts`
Expected: PASS. Si algo falla, es un filtro que falta en una ruta: arreglar la ruta (no el test).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(server): suite de aislamiento entre usuarios" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/isolation.test.ts
git push
```

---

### Task 19: `bun run migrate:owner`

**Files:**
- Create: `server/src/db/migrateOwner.ts`, `server/src/db/migrateOwner.test.ts`
- Modify: `package.json` (script)

**Interfaces:**
- Produces: `interface MigrationCount { collection: string; updated: number }`, `interface MigrationResult { ownerId: Types.ObjectId; createdOwner: boolean; counts: MigrationCount[] }`, `migrateOwner(ownerEmail: string): Promise<MigrationResult>`.

- [ ] **Step 1: Test**

`server/src/db/migrateOwner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel, UserModel, USER_SCOPED_MODEL_NAMES } from "./models.js";
import { migrateOwner } from "./migrateOwner.js";

withDb();

const legacyStatement = {
  issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: new Date("2026-07-14"),
  totals: { totalConsumos: { ars: 1, usd: 0 }, saldoActual: { ars: 1, usd: 0 }, pagoMinimo: { ars: 1, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
  sourceFileName: "r.pdf", sourceHash: "hash-legado", pageCount: 1, parserVersion: "1.0.0", needsReview: false,
  reconciliation: { ok: true, entries: [] }, reviewedKeys: [],
};

const seedLegacy = async () => {
  await StatementModel.init();
  await StatementModel.collection.createIndex({ sourceHash: 1 }, { unique: true, name: "sourceHash_1" });
  await StatementModel.collection.insertOne({ ...legacyStatement });
  await TransactionModel.collection.insertOne({ descripcion: "legado" });
};

describe("migrateOwner", () => {
  it("crea al owner y le asigna todo lo que no tiene userId", async () => {
    await seedLegacy();
    const { ownerId, createdOwner, counts } = await migrateOwner(" Owner@Test.dev ");
    expect(createdOwner).toBe(true);
    expect((await UserModel.findOne({ email: "owner@test.dev" }))?._id.equals(ownerId)).toBe(true);
    expect(await StatementModel.countDocuments({ userId: ownerId })).toBe(1);
    expect(await TransactionModel.countDocuments({ userId: ownerId })).toBe(1);
    expect(counts).toHaveLength(USER_SCOPED_MODEL_NAMES.length);
    expect(counts.find(({ collection }) => collection === "statements")?.updated).toBe(1);
  });

  it("reemplaza el índice único viejo por el compuesto", async () => {
    await seedLegacy();
    await migrateOwner("owner@test.dev");
    const names = (await StatementModel.collection.indexes()).map(({ name }) => name);
    expect(names).not.toContain("sourceHash_1");
    expect(names).toContain("userId_1_sourceHash_1");
  });

  it("una segunda corrida no actualiza nada ni crea otro owner", async () => {
    await seedLegacy();
    const first = await migrateOwner("owner@test.dev");
    const second = await migrateOwner("owner@test.dev");
    expect(second.createdOwner).toBe(false);
    expect(second.ownerId.equals(first.ownerId)).toBe(true);
    expect(second.counts.every(({ updated }) => updated === 0)).toBe(true);
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it("con la base vacía solo crea al owner", async () => {
    const { createdOwner, counts } = await migrateOwner("owner@test.dev");
    expect(createdOwner).toBe(true);
    expect(counts.every(({ updated }) => updated === 0)).toBe(true);
  });
});
```

Run: `bunx vitest run server/src/db/migrateOwner.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

`server/src/db/migrateOwner.ts`:

```ts
import mongoose, { type Types } from "mongoose";
import { normalizeEmail } from "../auth/authConfig.js";
import { connectMongo, disconnectMongo } from "./connection.js";
import { USER_SCOPED_MODEL_NAMES, UserModel } from "./models.js";

export interface MigrationCount {
  collection: string;
  updated: number;
}

export interface MigrationResult {
  ownerId: Types.ObjectId;
  createdOwner: boolean;
  counts: MigrationCount[];
}

const ensureOwner = async (email: string): Promise<{ ownerId: Types.ObjectId; createdOwner: boolean }> => {
  const existing = await UserModel.findOne({ email });
  if (existing) return { ownerId: existing._id, createdOwner: false };
  const owner = await UserModel.create({ email, name: email });
  return { ownerId: owner._id, createdOwner: true };
};

const migrateModel = async (name: string, ownerId: Types.ObjectId): Promise<MigrationCount> => {
  const model = mongoose.model(name);
  const { modifiedCount } = await model.updateMany({ userId: { $exists: false } }, { $set: { userId: ownerId } });
  await model.syncIndexes();
  return { collection: model.collection.collectionName, updated: modifiedCount };
};

export async function migrateOwner(ownerEmail: string): Promise<MigrationResult> {
  const { ownerId, createdOwner } = await ensureOwner(normalizeEmail(ownerEmail));
  const counts: MigrationCount[] = [];
  for (const name of USER_SCOPED_MODEL_NAMES) counts.push(await migrateModel(name, ownerId));
  return { ownerId, createdOwner, counts };
}

if (process.argv[1]?.endsWith("migrateOwner.ts")) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim() ?? "";
  if (ownerEmail === "") throw new Error("Falta OWNER_EMAIL en el .env");
  await connectMongo(process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly");
  const { createdOwner, counts } = await migrateOwner(ownerEmail);
  console.log(createdOwner ? "Owner creado" : "Owner existente");
  for (const { collection, updated } of counts) console.log(`  ${collection}: ${updated} actualizados`);
  await disconnectMongo();
}
```

En `package.json`, junto a los otros scripts:

```json
    "migrate:owner": "tsx --env-file=.env server/src/db/migrateOwner.ts",
```

- [ ] **Step 3: Correr y typecheck**

Run: `bunx vitest run server/src/db && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): migrate:owner asigna los datos existentes al owner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/db/migrateOwner.ts server/src/db/migrateOwner.test.ts package.json
git push
```

---

### Task 20: README, `.env.example` y verificación final

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: `.env.example`**

Después de `PORT=4000`:

```
# Login con Google (obligatorio). Pasos en el README, sección «Login».
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Al menos 32 caracteres: openssl rand -base64 48
SESSION_SECRET=
OWNER_EMAIL=
# Otros mails que pueden entrar, separados por coma.
ALLOWED_EMAILS=
PUBLIC_URL=http://localhost:5173
```

- [ ] **Step 2: README**

- En «Puesta en marcha», entre `docker compose up -d` y `bun run seed`: `bun run migrate:owner     # crea tu usuario (OWNER_EMAIL)`.
- En «Scripts»: `- bun run migrate:owner — crea el usuario owner y le asigna los datos que no tienen dueño (se puede correr varias veces)`.
- Sección nueva «Login», antes de «Versión publicada», con: qué es (Google + lista de mails, cookie de 30 días, `Salir`), los pasos de Google Cloud de la Tarea 7 Step 1 (proyecto aparte, Externo y publicado, `openid email profile`, cliente «Aplicación web» y sus redirect URIs), las variables del `.env`, cómo sumar a alguien (`ALLOWED_EMAILS` y reiniciar) y cómo sacarlo (sacarlo de la lista y reiniciar: pierde el acceso aunque tenga sesión abierta). Mencionar que la sección «Mails» de Importar es solo del owner.
- Subsección «Puesta en marcha del login en la versión publicada», con el orden del spec: backup (`docker exec ledgerly-mongo mongodump --archive=/data/db/backup-pre-login.archive`), cliente de Google, variables en `~/Services/ledgerly/.env` (con `PUBLIC_URL=https://ledger.<tailnet>.ts.net`), merge, `bun run migrate:owner` desde `~/Services/ledgerly`, login, sumar el otro mail.

- [ ] **Step 3: Verificación final**

Run: `bun run test && bun run typecheck`
Expected: todo verde. Copiar el resumen de la salida (cantidad de tests pasados) para el reporte.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: login con Google y puesta en marcha" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- README.md .env.example
git push
```
