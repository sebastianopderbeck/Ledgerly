# Deploy en Vercel — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar Ledgerly en Vercel (cliente estático + Express en una función, Atlas como base) reemplazando la versión de la Mac, con mails por cron, OCR con Google Vision y aviso de mails en la app.

**Architecture:** El cliente de Vite se sirve estático desde `client/dist`; `api/[...path].ts` exporta un handler que conecta a Mongo una vez por instancia y delega en la app de Express de siempre. Los mails corren por dos cron jobs de Vercel que pegan a `/api/cron/mail/:source` con `CRON_SECRET`; la agenda se evalúa en hora de Argentina. El OCR de imágenes elige Google Vision cuando hay API key. Las piezas que solo existían para la Mac (agenda con timers, notificaciones, scripts del servicio) se borran.

**Tech Stack:** Vercel (Hobby, Fluid compute, cron), MongoDB Atlas (Free), Express 4, Mongoose 8, Google Cloud Vision REST, React 18 + MUI 6 + TanStack Query 5, Vitest + supertest + mongodb-memory-server, Bun.

**Spec:** `docs/superpowers/specs/2026-10-16-deploy-vercel-design.md`

## Global Constraints

- Se trabaja en el worktree `.claude/worktrees/deploy-vercel`, rama `feat/deploy-vercel` (sale de `feat/login-multiusuario`). Al empezar: `bun install --frozen-lockfile`.
- Comandos desde la raíz del worktree. Un test: `bunx vitest run <ruta>`. Todo: `bun run test`. Tipos: `bun run typecheck`.
- Cada tarea termina con tests y typecheck verdes, un commit con pathspec explícito (en zsh, rutas con corchetes entre comillas: `'api/[...path].ts'`) y `git push`. Formato: `git commit -m "<tipo>(<scope>): <resumen en castellano>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <archivos>`. Nunca push a `main`, nunca PR ni merge.
- Sin comentarios en el código. TypeScript estricto, sin `any` escrito. React con las convenciones del repo (arrow functions, props con `interface`, lógica antes del `return`, early returns).
- Tests de servidor que hablan HTTP: siempre con `server/src/testing/localServer.ts` o `withAuthedApi` (servers en `127.0.0.1`); nunca `request(app)` directo.
- Tests de cliente con varios renders: `afterEach(cleanup)`.
- Ningún dato real en código, tests ni commits.
- Valores exactos del spec: `maxDuration` 300; subida web 4 MB (`4 * 1024 * 1024` bytes) con «El archivo supera el máximo de 4 MB»; cron `/api/cron/mail/icloud` a `0 0 * * *` y `/api/cron/mail/gmail` a `0 1 * * *` (UTC); zona horaria `America/Argentina/Buenos_Aires`; horas de Argentina iCloud 21 y Gmail 22; 401 del cron `{ error: "No autorizado" }`; skip fuera de agenda `{ skipped: "fuera de agenda" }`; HEIC con Google: «Mandá la imagen como JPG o PNG»; `GOOGLE_VISION_API_KEY`, `ICLOUD_APP_PASSWORD`, `CRON_SECRET`, `ATLAS_URL`; pool de Mongo `maxPoolSize: 5`.
- Las tareas 3 y 13 son con el usuario: el agente prepara y verifica, el usuario hace lo que pide su cuenta (Vercel, Google Cloud, Atlas) y el merge.

## Review Focus

1. `CRON_SECRET` sin definir en el entorno: el endpoint de cron tiene que rechazar todo, incluso `Authorization: Bearer ` vacío. Test en la Tarea 5.
2. Borde de día: el cron de las `00:30Z` del 26 corre el 25 en Argentina (adentro de `25-5`), y el de las `00:30Z` del 25 corre el 24 (afuera). Test en la Tarea 5.
3. Google Vision omite `x` o `y` cuando valen 0: la observación no puede quedar con `NaN`. Test en la Tarea 7.
4. Extensión HEIC en mayúsculas (`IMG_1234.HEIC`) con Google: mismo rechazo que en minúsculas. Test en la Tarea 7.
5. Un archivo de exactamente 4 MB entra; uno de 4 MB + 1 byte no, ni en el server ni en el cliente. Test en la Tarea 10.

---

## Mapa de archivos

**Nuevos**
- `api/[...path].ts` — función de Vercel.
- `vercel.json` — build, ruteo, función, headers, región y crons.
- `server/src/db/serverlessConnection.ts` — conexión a Mongo una vez por instancia.
- `server/src/vercel/handler.ts` — handler que conecta y delega en Express.
- `server/src/vercel/vercelConfig.test.ts` — chequea `vercel.json` contra el código.
- `server/src/http/routes/cron.ts` — `GET /api/cron/mail/:source`.
- `server/src/ocr/googleVision.ts` — adaptador de Google Vision.
- `server/src/mail/mailNotice.ts` — si hay novedades de mails sin ver.
- `server/src/http/uploadFile.ts` — multer con el límite de 4 MB.
- `shared/src/uploads.ts` — `MAX_UPLOAD_BYTES` y su mensaje.
- `client/src/components/layout/ImportShortcut.tsx` — ícono de Importar con el punto de aviso.
- `scripts/backup-atlas.sh`, `scripts/restore-local.sh`.

**Borrados**
- `server/src/mail/mailJob.ts` (+ test), `server/src/mail/notifyRun.ts` (+ test).
- `scripts/install-service.sh`, `scripts/deploy.sh`, `scripts/auto-deploy.sh`, `scripts/service-common.sh`, `scripts/test-service-scripts.sh`.

**Modificados**: `server/src/mail/mailSchedule.ts`, `server/src/gmail/gmailSource.ts`, `server/src/icloud/icloudSource.ts`, `server/src/icloud/icloudConfig.ts`, `server/src/mail/mailSources.ts`, `server/src/http/routes/mail.ts`, `server/src/http/app.ts`, `server/src/index.ts`, `server/src/ocr/recognizeImage.ts`, `server/src/ingestion/errors.ts`, `server/src/http/routes/import.ts`, `server/src/http/routes/statements.ts`, `server/src/db/models.ts`, `shared/src/dtos.ts`, `shared/src/index.ts`, `client/src/api/hooks.ts`, `client/src/components/layout/TopActionsPill.tsx`, `client/src/pages/ImportPage.tsx`, `client/src/components/FileDropzone.tsx`, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`.

---

### Task 1: Conexión a Mongo una vez por instancia

**Files:**
- Create: `server/src/db/serverlessConnection.ts`, `server/src/db/serverlessConnection.test.ts`

**Interfaces:**
- Produces: `SERVERLESS_POOL_SIZE = 5`, `type Connect = (url: string) => Promise<unknown>`, `mongooseConnect: Connect`, `createConnector(connect?: Connect): (url: string) => Promise<void>`.

- [ ] **Step 1: Test**

`server/src/db/serverlessConnection.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createConnector } from "./serverlessConnection.js";

const URL = "mongodb://sintetico/ledgerly";

describe("createConnector", () => {
  it("conecta una sola vez aunque lo llamen varias veces", async () => {
    const connect = vi.fn(async () => undefined);
    const connectOnce = createConnector(connect);
    await connectOnce(URL);
    await connectOnce(URL);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(URL);
  });

  it("dos llamadas simultáneas comparten la misma conexión", async () => {
    const connect = vi.fn(async () => undefined);
    const connectOnce = createConnector(connect);
    await Promise.all([connectOnce(URL), connectOnce(URL)]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("si falla, la próxima llamada reintenta", async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Atlas no responde"))
      .mockResolvedValueOnce(undefined);
    const connectOnce = createConnector(connect);
    await expect(connectOnce(URL)).rejects.toThrow("Atlas no responde");
    await expect(connectOnce(URL)).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
```

Run: `bunx vitest run server/src/db/serverlessConnection.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 2: Implementar**

`server/src/db/serverlessConnection.ts`:

```ts
import mongoose from "mongoose";

export const SERVERLESS_POOL_SIZE = 5;

export type Connect = (url: string) => Promise<unknown>;

export const mongooseConnect: Connect = (url) => mongoose.connect(url, { maxPoolSize: SERVERLESS_POOL_SIZE });

export function createConnector(connect: Connect = mongooseConnect): (url: string) => Promise<void> {
  let pending: Promise<void> | null = null;
  return (url) => {
    pending ??= connect(url).then(
      () => undefined,
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
}
```

Run: `bunx vitest run server/src/db/serverlessConnection.test.ts && bun run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/db/serverlessConnection.ts server/src/db/serverlessConnection.test.ts
git commit -m "feat(server): conexión a Mongo una vez por instancia" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/db/serverlessConnection.ts server/src/db/serverlessConnection.test.ts
git push -u origin feat/deploy-vercel
```

---

### Task 2: Función de Vercel y `vercel.json`

**Files:**
- Create: `server/src/vercel/handler.ts`, `server/src/vercel/handler.test.ts`, `server/src/vercel/vercelConfig.test.ts`, `api/[...path].ts`, `vercel.json`
- Modify: `server/src/http/app.ts` (`AppDeps` gana `env` y `now`, usados en la Tarea 5), `tsconfig.json` (incluir `api`), `package.json` (`engines`)

**Interfaces:**
- Consumes: `createConnector` (Task 1), `createApp`, `readAuthConfig`.
- Produces:
  - `interface HandlerDeps { env: NodeJS.ProcessEnv; connect: (url: string) => Promise<void>; build: (env: NodeJS.ProcessEnv) => Express }`
  - `createHandler(deps: HandlerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void>`
  - `buildApp(env: NodeJS.ProcessEnv): Express`
  - `AppDeps { google?: GoogleAuthClient; env?: NodeJS.ProcessEnv; now?: () => Date }`

- [ ] **Step 1: Test del handler**

`server/src/vercel/handler.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { withLocalServers } from "../testing/localServer.js";
import { createHandler } from "./handler.js";

const serve = withLocalServers();
const ENV = { MONGO_URL: "mongodb://sintetico/ledgerly" };

const pingApp = () => {
  const app = express();
  app.get("/api/health", (_req, res) => { res.json({ status: "ok" }); });
  return app;
};

describe("createHandler", () => {
  it("conecta, arma la app una vez y le pasa los requests", async () => {
    const connect = vi.fn(async () => undefined);
    const build = vi.fn(pingApp);
    const server = await serve(createHandler({ env: ENV, connect, build }));
    expect((await request(server).get("/api/health")).body).toEqual({ status: "ok" });
    expect((await request(server).get("/api/health")).status).toBe(200);
    expect(connect).toHaveBeenCalledWith(ENV.MONGO_URL);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("si Mongo no conecta responde 500 genérico y el próximo request reintenta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Atlas no responde"))
      .mockResolvedValue(undefined);
    const server = await serve(createHandler({ env: ENV, connect, build: pingApp }));
    const first = await request(server).get("/api/health");
    expect(first.status).toBe(500);
    expect(first.body).toEqual({ error: "Error interno" });
    expect((await request(server).get("/api/health")).status).toBe(200);
  });

  it("sin MONGO_URL responde 500 sin intentar conectar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const connect = vi.fn(async () => undefined);
    const server = await serve(createHandler({ env: {}, connect, build: pingApp }));
    expect((await request(server).get("/api/health")).status).toBe(500);
    expect(connect).not.toHaveBeenCalled();
  });
});
```

Run: `bunx vitest run server/src/vercel/handler.test.ts` → FAIL.

- [ ] **Step 2: Handler y función**

`server/src/vercel/handler.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { readAuthConfig } from "../auth/authConfig.js";
import { createApp } from "../http/app.js";

export interface HandlerDeps {
  env: NodeJS.ProcessEnv;
  connect: (url: string) => Promise<void>;
  build: (env: NodeJS.ProcessEnv) => Express;
}

const INTERNAL_ERROR = JSON.stringify({ error: "Error interno" });

const mongoUrlOf = (env: NodeJS.ProcessEnv): string => {
  const url = env.MONGO_URL?.trim() ?? "";
  if (url === "") throw new Error("Falta MONGO_URL");
  return url;
};

const replyInternalError = (res: ServerResponse): void => {
  res.statusCode = 500;
  res.setHeader("Content-Type", "application/json");
  res.end(INTERNAL_ERROR);
};

export const buildApp = (env: NodeJS.ProcessEnv): Express => createApp(readAuthConfig(env), { env });

export function createHandler({ env, connect, build }: HandlerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  let app: Express | null = null;
  return async (req, res) => {
    try {
      await connect(mongoUrlOf(env));
      app ??= build(env);
    } catch (error) {
      console.error(`Arranque: ${error instanceof Error ? error.message : String(error)}`);
      replyInternalError(res);
      return;
    }
    app(req, res);
  };
}
```

`api/[...path].ts`:

```ts
import { createConnector } from "../server/src/db/serverlessConnection.js";
import { buildApp, createHandler } from "../server/src/vercel/handler.js";

export default createHandler({ env: process.env, connect: createConnector(), build: buildApp });
```

`server/src/http/app.ts`: `AppDeps` y la firma de `createApp` pasan a

```ts
export interface AppDeps {
  google?: GoogleAuthClient;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export function createApp(
  config: AuthConfig, { google = createGoogleAuthClient(config), env = process.env, now = () => new Date() }: AppDeps = {},
): express.Express {
```

(`env` y `now` se usan en la Tarea 5; mientras tanto quedan sin usar.)

`tsconfig.json`: `"include": ["shared/src", "server/src", "client/src", "vitest.config.ts", "api"]`.

`package.json` (raíz): agregar `"engines": { "node": "22.x" }`.

Run: `bunx vitest run server/src/vercel/handler.test.ts && bun run typecheck` → PASS.

- [ ] **Step 3: Test de `vercel.json`**

`server/src/vercel/vercelConfig.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface VercelConfig {
  outputDirectory: string;
  regions: string[];
  functions: Record<string, { maxDuration: number }>;
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
  crons?: { path: string; schedule: string }[];
}

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../vercel.json", import.meta.url)), "utf8"),
) as VercelConfig;

const spaRewrite = config.rewrites.find(({ destination }) => destination === "/index.html");
const spaPattern = new RegExp(`^${spaRewrite?.source ?? "$^"}$`);

describe("vercel.json", () => {
  it("sirve el build de Vite como estático", () => {
    expect(config.outputDirectory).toBe("client/dist");
  });

  it("la función tiene 300 s", () => {
    expect(config.functions["api/[...path].ts"]).toEqual({ maxDuration: 300 });
  });

  it("corre en una sola región", () => {
    expect(config.regions).toHaveLength(1);
  });

  it("el rewrite del SPA no tapa /api", () => {
    expect(spaPattern.test("/flujo")).toBe(true);
    expect(spaPattern.test("/")).toBe(true);
    expect(spaPattern.test("/api/health")).toBe(false);
    expect(spaPattern.test("/api/cron/mail/gmail")).toBe(false);
  });

  it("manda los headers de seguridad en todas las rutas", () => {
    const all = config.headers.find(({ source }) => source === "/(.*)")?.headers ?? [];
    expect(all).toEqual(expect.arrayContaining([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ]));
  });
});
```

Run → FAIL (no existe `vercel.json`).

- [ ] **Step 4: `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "bun install --frozen-lockfile",
  "buildCommand": "bun run build",
  "outputDirectory": "client/dist",
  "regions": ["gru1"],
  "functions": {
    "api/[...path].ts": { "maxDuration": 300 }
  },
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "same-origin" },
        { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'" }
      ]
    }
  ]
}
```

(La región `gru1` se revisa en la Tarea 13: si Atlas Free no ofrece São Paulo, pasa a `iad1`.)

Run: `bunx vitest run server/src/vercel && bun run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/vercel 'api/[...path].ts' vercel.json server/src/http/app.ts tsconfig.json package.json
git commit -m "feat: función de Vercel y vercel.json" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/vercel 'api/[...path].ts' vercel.json server/src/http/app.ts tsconfig.json package.json
git push
```

---

### Task 3: Prueba en Vercel (manual, con el usuario)

Valida el riesgo del spec: que Vercel buildee la función con `@ledgerly/shared` (TypeScript sin compilar en un workspace de bun). **No se sigue a la Tarea 4 sin el resultado.**

- [ ] **Step 1: Pedirle al usuario la cuenta**

El usuario corre en el prompt (son interactivos):

```
! bunx vercel login
! bunx vercel link
```

En `link`: crear un proyecto nuevo llamado `ledgerly`, en su cuenta personal, sin cambiar los settings detectados (`vercel.json` los define).

- [ ] **Step 2: Deploy de prueba**

```bash
bunx vercel deploy
```

Es un preview, sin variables: no toca ninguna base. Anotar la URL que imprime.

- [ ] **Step 3: Verificar**

El usuario abre en el navegador (los previews piden estar logueado en Vercel):
- `<url>/` y `<url>/flujo` → la pantalla de carga de Ledgerly (el SPA y su rewrite andan).
- `<url>/api/health` → `{"error":"Error interno"}`. Esa respuesta sale del handler propio (falta `MONGO_URL`), así que prueba que la función cargó todo el grafo de módulos, `@ledgerly/shared` incluido.

Si en cambio aparece la página de error de Vercel (`FUNCTION_INVOCATION_FAILED` o similar): `bunx vercel logs <url>` y buscar el error de import.

- [ ] **Step 4a: Si anduvo**

Anotar «Task 3: complete (preview <fecha>: SPA ok, /api/health = Error interno del handler)» y seguir con la Tarea 4.

- [ ] **Step 4b: Si falló por `@ledgerly/shared`**

Compilar `shared` a JavaScript para producción, manteniendo el código fuente para desarrollo y tests:

`shared/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "declaration": false, "rootDir": "src" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

`shared/package.json`:

```json
  "main": "dist/index.js",
  "types": "src/index.ts",
  "exports": { ".": { "types": "./src/index.ts", "source": "./src/index.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -p tsconfig.build.json" },
```

`package.json` (raíz): `"build": "bun run --filter '@ledgerly/shared' build && bun run --filter '@ledgerly/client' build"`, y `"dev:server"` / `"start"` con `--conditions=source` (`tsx watch --conditions=source --env-file=.env server/src/index.ts`). `vitest.config.ts` y `client/vite.config.ts`: `resolve: { conditions: ["source"] }`. `.gitignore`: `shared/dist`. Volver a correr `bun run test`, `bun run typecheck` y el Step 2. Commitear como «build(shared): compilar a JavaScript para la función de Vercel» y anotar el ruling.

Si falló por otra cosa: frenar y avisar al usuario con el error de los logs.

---

### Task 4: Agenda de mails sin timers

**Files:**
- Modify: `server/src/mail/mailSchedule.ts`, `server/src/mail/mailSchedule.test.ts` (reescrito), `server/src/gmail/gmailSource.ts`, `server/src/gmail/gmailSource.test.ts`, `server/src/icloud/icloudSource.ts`, `server/src/http/routes/mail.test.ts`, `server/src/index.ts`
- Delete: `server/src/mail/mailJob.ts`, `server/src/mail/mailJob.test.ts`, `server/src/mail/notifyRun.ts`, `server/src/mail/notifyRun.test.ts`

**Interfaces:**
- Produces:
  - `interface MailDays { fromDay: number; toDay: number }`, `interface MailSchedule extends MailDays { hour: number }`, `interface MailScheduleConfig { days: MailDays | null; invalid: string[] }`
  - `MAIL_TIME_ZONE = "America/Argentina/Buenos_Aires"`, `MAIL_CRON_HOURS: Record<MailSource, number> = { icloud: 21, gmail: 22 }`
  - `parseMailSchedule(env): MailScheduleConfig`, `mailScheduleFor(source: MailSource, env): MailSchedule | null`
  - `isScheduledDay(days: MailDays, day: number): boolean`, `dayOfMonthIn(timeZone: string, now: Date): number`
  - `describeMailSchedule(schedule: MailSchedule): string` (sin cambios), `describeMailAutomation(config: MailScheduleConfig): string`

- [ ] **Step 1: Test nuevo de la agenda**

`server/src/mail/mailSchedule.test.ts` (reemplaza el archivo entero):

```ts
import { describe, it, expect } from "vitest";
import {
  MAIL_CRON_HOURS, MAIL_TIME_ZONE, dayOfMonthIn, describeMailAutomation, describeMailSchedule, isScheduledDay,
  mailScheduleFor, parseMailSchedule,
} from "./mailSchedule.js";

const WINDOW = { fromDay: 25, toDay: 5 };

describe("parseMailSchedule", () => {
  it("sin MAIL_SYNC_DAYS la búsqueda automática está apagada", () => {
    expect(parseMailSchedule({})).toEqual({ days: null, invalid: [] });
  });

  it("lee el rango de días", () => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: " 1 - 10 " })).toEqual({ days: { fromDay: 1, toDay: 10 }, invalid: [] });
  });

  it.each(["x", "0-5", "25-32", "25"])("rechaza %s", (raw) => {
    expect(parseMailSchedule({ MAIL_SYNC_DAYS: raw })).toEqual({
      days: null, invalid: ["MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)"],
    });
  });
});

describe("mailScheduleFor", () => {
  it("usa la hora del cron de cada fuente", () => {
    expect(mailScheduleFor("icloud", { MAIL_SYNC_DAYS: "25-5" })).toEqual({ fromDay: 25, toDay: 5, hour: 21 });
    expect(mailScheduleFor("gmail", { MAIL_SYNC_DAYS: "25-5" })).toEqual({ fromDay: 25, toDay: 5, hour: 22 });
    expect(mailScheduleFor("gmail", {})).toBeNull();
  });

  it("las horas son las del spec", () => {
    expect(MAIL_CRON_HOURS).toEqual({ icloud: 21, gmail: 22 });
  });
});

describe("isScheduledDay", () => {
  it.each([[24, false], [25, true], [31, true], [1, true], [5, true], [6, false]])("del 25 al 5, el %i → %s", (day, expected) => {
    expect(isScheduledDay(WINDOW, day)).toBe(expected);
  });

  it("un rango dentro del mes", () => {
    expect(isScheduledDay({ fromDay: 1, toDay: 10 }, 10)).toBe(true);
    expect(isScheduledDay({ fromDay: 1, toDay: 10 }, 11)).toBe(false);
  });
});

describe("dayOfMonthIn", () => {
  it("devuelve el día en Buenos Aires aunque en UTC ya sea el siguiente", () => {
    expect(dayOfMonthIn(MAIL_TIME_ZONE, new Date("2026-10-26T00:30:00Z"))).toBe(25);
    expect(dayOfMonthIn(MAIL_TIME_ZONE, new Date("2026-10-25T00:30:00Z"))).toBe(24);
    expect(dayOfMonthIn(MAIL_TIME_ZONE, new Date("2026-10-25T15:00:00Z"))).toBe(25);
  });
});

describe("describeMailSchedule y describeMailAutomation", () => {
  it("describe la agenda de una fuente", () => {
    expect(describeMailSchedule({ fromDay: 25, toDay: 5, hour: 21 })).toBe("todos los días a las 21 h, del 25 al 5");
  });

  it("resume la búsqueda automática", () => {
    expect(describeMailAutomation(parseMailSchedule({ MAIL_SYNC_DAYS: "25-5" })))
      .toBe("Mails: búsqueda automática del 25 al 5 (iCloud 21 h, Gmail 22 h)");
    expect(describeMailAutomation(parseMailSchedule({}))).toBe("Mails: búsqueda automática apagada (falta MAIL_SYNC_DAYS)");
    expect(describeMailAutomation(parseMailSchedule({ MAIL_SYNC_DAYS: "x" })))
      .toBe("Mails: MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5), búsqueda automática apagada");
  });
});
```

Run: `bunx vitest run server/src/mail/mailSchedule.test.ts` → FAIL.

- [ ] **Step 2: Reescribir la agenda**

`server/src/mail/mailSchedule.ts`:

```ts
import type { MailSource } from "@ledgerly/shared";

export interface MailDays {
  fromDay: number;
  toDay: number;
}

export interface MailSchedule extends MailDays {
  hour: number;
}

export interface MailScheduleConfig {
  days: MailDays | null;
  invalid: string[];
}

export const MAIL_TIME_ZONE = "America/Argentina/Buenos_Aires";

export const MAIL_CRON_HOURS: Record<MailSource, number> = { icloud: 21, gmail: 22 };

const DAYS_PATTERN = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/;
const INVALID_DAYS = "MAIL_SYNC_DAYS inválido (DD-DD, por ejemplo 25-5)";

const isDayOfMonth = (day: number): boolean => day >= 1 && day <= 31;

const parseDays = (raw: string): MailDays | null => {
  const match = DAYS_PATTERN.exec(raw);
  if (!match) return null;
  const [fromDay, toDay] = [Number(match[1]), Number(match[2])];
  return isDayOfMonth(fromDay) && isDayOfMonth(toDay) ? { fromDay, toDay } : null;
};

export function parseMailSchedule(env: NodeJS.ProcessEnv): MailScheduleConfig {
  const rawDays = env.MAIL_SYNC_DAYS?.trim() ?? "";
  if (rawDays === "") return { days: null, invalid: [] };
  const days = parseDays(rawDays);
  return days ? { days, invalid: [] } : { days: null, invalid: [INVALID_DAYS] };
}

export function mailScheduleFor(source: MailSource, env: NodeJS.ProcessEnv): MailSchedule | null {
  const { days } = parseMailSchedule(env);
  return days ? { ...days, hour: MAIL_CRON_HOURS[source] } : null;
}

export function isScheduledDay({ fromDay, toDay }: MailDays, day: number): boolean {
  return fromDay <= toDay ? day >= fromDay && day <= toDay : day >= fromDay || day <= toDay;
}

export function dayOfMonthIn(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(now));
}

export function describeMailSchedule({ fromDay, toDay, hour }: MailSchedule): string {
  return `todos los días a las ${hour} h, del ${fromDay} al ${toDay}`;
}

export function describeMailAutomation({ days, invalid }: MailScheduleConfig): string {
  if (days) {
    return `Mails: búsqueda automática del ${days.fromDay} al ${days.toDay} (iCloud ${MAIL_CRON_HOURS.icloud} h, Gmail ${MAIL_CRON_HOURS.gmail} h)`;
  }
  if (invalid.length > 0) return `Mails: ${invalid.join("; ")}, búsqueda automática apagada`;
  return "Mails: búsqueda automática apagada (falta MAIL_SYNC_DAYS)";
}
```

- [ ] **Step 3: Fuentes, índice y borrados**

- `server/src/gmail/gmailSource.ts`: `import { mailScheduleFor } from "../mail/mailSchedule.js";` y `schedule: mailScheduleFor("gmail", env),` (sacar el import de `parseMailSchedule`).
- `server/src/icloud/icloudSource.ts`: `schedule: mailScheduleFor("icloud", env),` y en `describeIcloudSource`, `const automatic = parseMailSchedule(env).days !== null;` (importar los dos).
- `server/src/index.ts`: sacar los imports de `findOwnerId`, `startMailJob` y `readMailSourceSetups`, y las dos últimas líneas (`resolveOwner` y el `for`). Quedan los `console.log` de `describeMailAutomation`, `describeGmailSetup` y `describeIcloudSource`.
- `git rm server/src/mail/mailJob.ts server/src/mail/mailJob.test.ts server/src/mail/notifyRun.ts server/src/mail/notifyRun.test.ts`
- `server/src/gmail/gmailSource.test.ts`: el caso que pasa `MAIL_SYNC_HOUR: "9"` lo saca y espera `schedule: { fromDay: 25, toDay: 5, hour: 22 }`.
- `server/src/http/routes/mail.test.ts`: `SCHEDULE_VARS = ["MAIL_SYNC_DAYS"]`; el caso con `MAIL_SYNC_HOUR: "9"` lo saca y espera `"todos los días a las 21 h, del 25 al 5"` para iCloud y `"todos los días a las 22 h, del 25 al 5"` para Gmail.
- `grep -rn "MAIL_SYNC_HOUR\|startMailJob\|notifyRun\|nextScheduledRun\|MAIL_STARTUP_DELAY_MS" server client shared` → sin resultados (salvo el README, que es de la Tarea 12).

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A server/src/mail server/src/gmail server/src/icloud server/src/http/routes/mail.test.ts server/src/index.ts
git commit -m "refactor(server): la agenda de mails sin timers ni notificaciones de macOS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/mail server/src/gmail server/src/icloud server/src/http/routes/mail.test.ts server/src/index.ts
git push
```

---

### Task 5: Endpoint de cron y crons en `vercel.json`

**Files:**
- Create: `server/src/http/routes/cron.ts`, `server/src/http/routes/cron.test.ts`
- Modify: `server/src/mail/mailSources.ts` (`describeMissing`), `server/src/http/routes/mail.ts` (usarlo), `server/src/http/app.ts` (montar), `server/src/http/app.test.ts`, `vercel.json`, `server/src/vercel/vercelConfig.test.ts`

**Interfaces:**
- Consumes: `parseMailSchedule`, `isScheduledDay`, `dayOfMonthIn`, `MAIL_TIME_ZONE`, `MAIL_CRON_HOURS` (Task 4); `findOwnerId`, `MISSING_OWNER`; `readMailSourceSetup`; `runMailSync`; `AppDeps.env`, `AppDeps.now` (Task 2).
- Produces: `interface CronDeps { env: NodeJS.ProcessEnv; ownerEmail: string; now: () => Date }`, `createCronRouter(deps: CronDeps): Router`, `CRON_UNAUTHORIZED = "No autorizado"`, `OUT_OF_SCHEDULE = "fuera de agenda"`, `describeMissing(source: MailSource, missing: string[]): string`.

- [ ] **Step 1: Test del endpoint**

`server/src/http/routes/cron.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { Types } from "mongoose";
import type { MailSyncRunDTO } from "@ledgerly/shared";

vi.mock("../../mail/mailSources.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../mail/mailSources.js")>()),
  readMailSourceSetup: vi.fn(),
}));
vi.mock("../../mail/syncMail.js", () => ({ runMailSync: vi.fn() }));
import { readMailSourceSetup } from "../../mail/mailSources.js";
import { runMailSync } from "../../mail/syncMail.js";
import { withDb } from "../../testing/withDb.js";
import { withLocalServers } from "../../testing/localServer.js";
import { UserModel } from "../../db/models.js";
import { MISSING_OWNER } from "../../auth/owner.js";
import { errorMiddleware } from "../errors.js";
import { CRON_UNAUTHORIZED, OUT_OF_SCHEDULE, createCronRouter } from "./cron.js";

withDb();
const serve = withLocalServers();

const SECRET = "secreto-de-cron-sintetico-de-32-caracteres";
const OWNER_EMAIL = "owner@test.dev";
const INSIDE = new Date("2026-10-26T00:30:00Z");
const OUTSIDE = new Date("2026-10-25T00:30:00Z");
const openClient = vi.fn();
const RUN: MailSyncRunDTO = {
  source: "icloud", trigger: "job", startedAt: "2026-10-26T00:30:00.000Z", finishedAt: "2026-10-26T00:30:05.000Z",
  status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [],
};

const call = async (now: Date, env: NodeJS.ProcessEnv, auth?: string, source = "icloud") => {
  const app = express();
  app.use("/api/cron", createCronRouter({ env, ownerEmail: OWNER_EMAIL, now: () => now }));
  app.use(errorMiddleware);
  const req = request(await serve(app)).get(`/api/cron/mail/${source}`);
  return auth === undefined ? req : req.set("Authorization", auth);
};

const ENV = { CRON_SECRET: SECRET, MAIL_SYNC_DAYS: "25-5" };
const BEARER = `Bearer ${SECRET}`;

beforeEach(() => {
  vi.mocked(readMailSourceSetup).mockReset();
  vi.mocked(runMailSync).mockReset();
  vi.mocked(readMailSourceSetup).mockResolvedValue({ source: "icloud", missing: [], scope: "INBOX", schedule: null, openClient });
  vi.mocked(runMailSync).mockResolvedValue(RUN);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/cron/mail/:source", () => {
  it("sin Authorization responde 401", async () => {
    const res = await call(INSIDE, ENV);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: CRON_UNAUTHORIZED });
  });

  it("con otro secreto responde 401", async () => {
    expect((await call(INSIDE, ENV, "Bearer otro")).status).toBe(401);
  });

  it("sin CRON_SECRET en el entorno rechaza todo, aun un Bearer vacío", async () => {
    expect((await call(INSIDE, { MAIL_SYNC_DAYS: "25-5" }, "Bearer ")).status).toBe(401);
    expect((await call(INSIDE, { MAIL_SYNC_DAYS: "25-5" }, "Bearer undefined")).status).toBe(401);
  });

  it("una fuente desconocida responde 400", async () => {
    expect((await call(INSIDE, ENV, BEARER, "hotmail")).status).toBe(400);
  });

  it("fuera de agenda en hora de Argentina no corre", async () => {
    const res = await call(OUTSIDE, ENV, BEARER);
    expect(res.body).toEqual({ skipped: OUT_OF_SCHEDULE });
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("sin MAIL_SYNC_DAYS no corre", async () => {
    expect((await call(INSIDE, { CRON_SECRET: SECRET }, BEARER)).body).toEqual({ skipped: OUT_OF_SCHEDULE });
  });

  it("sin usuario owner no corre y lo avisa", async () => {
    const res = await call(INSIDE, ENV, BEARER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ skipped: MISSING_OWNER });
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("con la fuente sin configurar no corre y dice qué falta", async () => {
    await UserModel.create({ email: OWNER_EMAIL, name: "Owner" });
    vi.mocked(readMailSourceSetup).mockResolvedValue({ source: "icloud", missing: ["ICLOUD_USER"], scope: null, schedule: null, openClient: null });
    const res = await call(INSIDE, ENV, BEARER);
    expect(res.body).toEqual({ skipped: "iCloud no está configurado: falta ICLOUD_USER" });
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("adentro de la agenda corre como owner y devuelve la corrida", async () => {
    const owner = await UserModel.create({ email: OWNER_EMAIL, name: "Owner" });
    const res = await call(INSIDE, ENV, BEARER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(RUN);
    const [ownerId, source, client, trigger] = vi.mocked(runMailSync).mock.calls[0];
    expect((ownerId as Types.ObjectId).equals(owner._id)).toBe(true);
    expect([source, client, trigger]).toEqual(["icloud", openClient, "job"]);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar**

En `server/src/mail/mailSources.ts`, agregar (con `import { MAIL_SOURCE_LABELS, type MailSource } from "@ledgerly/shared";`):

```ts
export const describeMissing = (source: MailSource, missing: string[]): string =>
  `${MAIL_SOURCE_LABELS[source]} no está configurado: ${missing.length === 1 ? "falta" : "faltan"} ${missing.join(", ")}`;
```

En `server/src/http/routes/mail.ts`: borrar `missingText` y usar `throw new HttpError(409, describeMissing(source, setup.missing));`.

`server/src/http/routes/cron.ts`:

```ts
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
```

En `server/src/http/app.ts`, importar `createCronRouter` y montarlo **antes** de `requireUser`, junto a `/api/auth`:

```ts
  app.use("/api/cron", createCronRouter({ env, ownerEmail: config.ownerEmail, now }));
```

En `server/src/http/app.test.ts`, test nuevo:

```ts
  it("el cron no pide sesión: sin su secreto responde su propio 401", async () => {
    const res = await request(local.server).get("/api/cron/mail/gmail");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "No autorizado" });
  });
```

- [ ] **Step 3: Crons en `vercel.json` y su test**

En `vercel.json`:

```json
  "crons": [
    { "path": "/api/cron/mail/icloud", "schedule": "0 0 * * *" },
    { "path": "/api/cron/mail/gmail", "schedule": "0 1 * * *" }
  ]
```

En `server/src/vercel/vercelConfig.test.ts` (importar `MAIL_CRON_HOURS` de `../mail/mailSchedule.js` y `mailSourceSchema` de `@ledgerly/shared`):

```ts
  it("hay un cron por fuente de mail, a la hora del spec en Argentina (UTC-3)", () => {
    const crons = config.crons ?? [];
    expect(crons.map(({ path }) => path).sort()).toEqual(["/api/cron/mail/gmail", "/api/cron/mail/icloud"]);
    for (const { path, schedule } of crons) {
      const source = mailSourceSchema.parse(path.split("/").at(-1));
      const [minute, hour, ...rest] = schedule.split(" ");
      expect(minute).toBe("0");
      expect(Number(hour)).toBe((MAIL_CRON_HOURS[source] + 3) % 24);
      expect(rest).toEqual(["*", "*", "*"]);
    }
  });
```

Run: `bunx vitest run server && bun run typecheck` → PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(server): cron de mails por fuente con CRON_SECRET" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/cron.ts server/src/http/routes/cron.test.ts server/src/mail/mailSources.ts server/src/http/routes/mail.ts server/src/http/app.ts server/src/http/app.test.ts vercel.json server/src/vercel/vercelConfig.test.ts
git push
```

---

### Task 6: Contraseña de iCloud por variable

**Files:**
- Modify: `server/src/icloud/icloudConfig.ts`, `server/src/icloud/icloudSource.ts`, `server/src/icloud/icloudSource.test.ts`, y los tests que esperen el texto viejo de «qué falta» (`grep -rn "la contraseña de app en el Llavero" server client`)

**Interfaces:**
- Produces: `ICLOUD_PASSWORD_VAR = "ICLOUD_APP_PASSWORD"`; `ICLOUD_PASSWORD_MISSING = "ICLOUD_APP_PASSWORD (o la contraseña de app en el Llavero)"`.

- [ ] **Step 1: Tests**

En `server/src/icloud/icloudSource.test.ts`, agregar:

```ts
  it("con ICLOUD_APP_PASSWORD no mira el Llavero y abre con esa contraseña", async () => {
    const d = deps(false);
    const setup = await icloudSourceSetup({ ICLOUD_USER: USER, ICLOUD_APP_PASSWORD: " clave-de-variable " }, d);
    expect(setup.missing).toEqual([]);
    await setup.openClient?.();
    expect(d.hasPassword).not.toHaveBeenCalled();
    expect(d.readPassword).not.toHaveBeenCalled();
    expect(d.open).toHaveBeenCalledWith(expect.objectContaining({ password: "clave-de-variable" }));
  });
```

y en `describe("describeIcloudSource")`:

```ts
  it("con ICLOUD_APP_PASSWORD no avisa que falta la contraseña", async () => {
    const hasPassword = vi.fn(async () => false);
    expect(await describeIcloudSource({ ICLOUD_USER: USER, ICLOUD_APP_PASSWORD: "x" }, hasPassword))
      .toBe("iCloud: habilitado (INBOX · últimos 90 días)");
    expect(hasPassword).not.toHaveBeenCalled();
  });
```

Reemplazar en los tests existentes el texto `"la contraseña de app en el Llavero"` por `ICLOUD_PASSWORD_MISSING` importado de `./icloudConfig.js` (o el texto nuevo literal donde no se pueda importar).

Run: `bunx vitest run server/src/icloud` → FAIL.

- [ ] **Step 2: Implementar**

`server/src/icloud/icloudConfig.ts`:

```ts
export const ICLOUD_PASSWORD_VAR = "ICLOUD_APP_PASSWORD";
export const ICLOUD_PASSWORD_MISSING = "ICLOUD_APP_PASSWORD (o la contraseña de app en el Llavero)";
```

(el segundo reemplaza al valor actual).

`server/src/icloud/icloudSource.ts`:

```ts
const envPassword = (env: NodeJS.ProcessEnv): string | null => env[ICLOUD_PASSWORD_VAR]?.trim() || null;
```

En `icloudSourceSetup`:

```ts
  const fromEnv = envPassword(env);
  const missing = fromEnv !== null || (await hasPassword(config.user)) ? [] : [ICLOUD_PASSWORD_MISSING];
```

y en `openClient`: `password: fromEnv ?? await readPassword(config.user),`.

En `describeIcloudSource`:

```ts
  const fromEnv = envPassword(env) !== null;
  return describeIcloudSetup(config, config ? fromEnv || await hasPassword(config.user) : false, automatic);
```

Run: `bunx vitest run server && bun run typecheck` → PASS (actualizar cualquier otro test que falle por el texto nuevo).

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(server): contraseña de iCloud por ICLOUD_APP_PASSWORD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/icloud
git push
```

(sumar al pathspec cualquier otro test tocado.)

---

### Task 7: OCR con Google Vision

**Files:**
- Create: `server/src/ocr/googleVision.ts`, `server/src/ocr/googleVision.test.ts`
- Modify: `server/src/ocr/recognizeImage.ts`, `server/src/ocr/recognizeImage.test.ts`, `server/src/ingestion/errors.ts`

**Interfaces:**
- Produces:
  - `GOOGLE_VISION_URL`, `GOOGLE_VISION_TIMEOUT_MS = 30_000`, `interface AnnotateResult`, `observationsFromAnnotation(result: AnnotateResult): OcrObservation[]`, `interface GoogleVisionDeps { apiKey: string; fetch: typeof fetch; timeoutMs: number }`, `recognizeWithGoogleVision(data: Uint8Array, deps: GoogleVisionDeps): Promise<OcrObservation[]>`
  - `RecognizeImageDeps` gana `googleApiKey: string | null` y `fetch: typeof fetch`; `recognizeImage(data, fileName, deps?)` elige proveedor.
  - `class UnsupportedImageFormatError extends IngestionError` con «Mandá la imagen como JPG o PNG».

- [ ] **Step 1: Test del adaptador**

`server/src/ocr/googleVision.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { OcrFailedError } from "../ingestion/errors.js";
import { toLines } from "./toLines.js";
import { GOOGLE_VISION_URL, observationsFromAnnotation, recognizeWithGoogleVision, type AnnotateResult } from "./googleVision.js";

const word = (text: string, x0: number, y0: number, x1: number, y1: number) => ({
  boundingBox: { vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] },
  symbols: [...text].map((char) => ({ text: char })),
});

const RESULT: AnnotateResult = {
  fullTextAnnotation: {
    pages: [{
      width: 1000,
      height: 2000,
      blocks: [{
        paragraphs: [
          { words: [word("Total", 100, 200, 200, 240), word("pagado", 220, 200, 320, 240), word("$1.234,56", 600, 202, 800, 242)] },
          { words: [word("Cuota", 100, 400, 200, 440), word("14", 220, 400, 260, 440)] },
        ],
      }],
    }],
  },
};

afterEach(() => vi.restoreAllMocks());

describe("observationsFromAnnotation", () => {
  it("normaliza cada palabra a la convención del OCR de macOS", () => {
    expect(observationsFromAnnotation(RESULT)[0]).toEqual({ text: "Total", x: 0.1, y: 0.11, height: 0.02 });
  });

  it("toLines arma las filas como con el OCR de macOS", () => {
    expect(toLines(observationsFromAnnotation(RESULT))).toBe("Total pagado $1.234,56\nCuota 14");
  });

  it("un vértice sin x o y vale 0 y no deja NaN", () => {
    const result: AnnotateResult = {
      fullTextAnnotation: { pages: [{ width: 100, height: 100, blocks: [{ paragraphs: [{ words: [{
        boundingBox: { vertices: [{}, { x: 10 }, { x: 10, y: 10 }, { y: 10 }] }, symbols: [{ text: "A" }],
      }] }] }] }] },
    };
    expect(observationsFromAnnotation(result)).toEqual([{ text: "A", x: 0, y: 0.05, height: 0.1 }]);
  });

  it("sin página falla con OcrFailedError", () => {
    expect(() => observationsFromAnnotation({})).toThrow(OcrFailedError);
  });
});

describe("recognizeWithGoogleVision", () => {
  it("manda la imagen en base64 pidiendo DOCUMENT_TEXT_DETECTION", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ responses: [RESULT] }), { status: 200 }));
    const observations = await recognizeWithGoogleVision(new Uint8Array([1, 2, 3]), { apiKey: "clave", fetch, timeoutMs: 1000 });
    expect(observations).toHaveLength(5);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${GOOGLE_VISION_URL}?key=clave`);
    expect(JSON.parse(String(init.body))).toEqual({
      requests: [{ image: { content: "AQID" }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
    });
  });

  it("un error de Google es OcrFailedError y se loguea sin la imagen", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
    await expect(recognizeWithGoogleVision(new Uint8Array([1]), { apiKey: "mala", fetch, timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(OcrFailedError);
    expect(log).toHaveBeenCalledWith("OCR (Google Vision): 400 API key not valid");
  });

  it("un error por imagen dentro de responses también es OcrFailedError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response(JSON.stringify({ responses: [{ error: { message: "Bad image data" } }] }), { status: 200 }));
    await expect(recognizeWithGoogleVision(new Uint8Array([1]), { apiKey: "k", fetch, timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(OcrFailedError);
  });

  it("si la red falla es OcrFailedError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(async () => { throw new Error("timeout"); });
    await expect(recognizeWithGoogleVision(new Uint8Array([1]), { apiKey: "k", fetch, timeoutMs: 1000 }))
      .rejects.toBeInstanceOf(OcrFailedError);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Adaptador**

`server/src/ocr/googleVision.ts`:

```ts
import { OcrFailedError } from "../ingestion/errors.js";
import type { OcrObservation } from "./recognizeImage.js";

export const GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
export const GOOGLE_VISION_TIMEOUT_MS = 30_000;

interface Vertex {
  x?: number;
  y?: number;
}

interface Word {
  boundingBox?: { vertices?: Vertex[] };
  symbols?: { text?: string }[];
}

interface Page {
  width?: number;
  height?: number;
  blocks?: { paragraphs?: { words?: Word[] }[] }[];
}

export interface AnnotateResult {
  fullTextAnnotation?: { pages?: Page[] };
  error?: { message?: string };
}

interface AnnotateResponse {
  responses?: AnnotateResult[];
  error?: { message?: string };
}

export interface GoogleVisionDeps {
  apiKey: string;
  fetch: typeof fetch;
  timeoutMs: number;
}

const wordObservation = (word: Word, width: number, height: number): OcrObservation | null => {
  const text = (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("");
  const vertices = word.boundingBox?.vertices ?? [];
  if (text === "" || vertices.length === 0) return null;
  const xs = vertices.map((vertex) => vertex.x ?? 0);
  const ys = vertices.map((vertex) => vertex.y ?? 0);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { text, x: Math.min(...xs) / width, y: (top + bottom) / 2 / height, height: (bottom - top) / height };
};

export function observationsFromAnnotation(result: AnnotateResult): OcrObservation[] {
  const page = result.fullTextAnnotation?.pages?.[0];
  if (!page?.width || !page.height) throw new OcrFailedError();
  const { width, height } = page;
  return (page.blocks ?? [])
    .flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.words ?? [])
    .map((current) => wordObservation(current, width, height))
    .filter((observation): observation is OcrObservation => observation !== null);
}

const failed = (detail: string): OcrFailedError => {
  console.error(`OCR (Google Vision): ${detail}`);
  return new OcrFailedError();
};

export async function recognizeWithGoogleVision(
  data: Uint8Array, { apiKey, fetch, timeoutMs }: GoogleVisionDeps,
): Promise<OcrObservation[]> {
  const body = JSON.stringify({
    requests: [{ image: { content: Buffer.from(data).toString("base64") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
  });
  const response = await fetch(`${GOOGLE_VISION_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: unknown) => {
    throw failed(error instanceof Error ? error.message : String(error));
  });
  const payload = (await response.json().catch(() => null)) as AnnotateResponse | null;
  const result = payload?.responses?.[0];
  const errorMessage = payload?.error?.message ?? result?.error?.message;
  if (!response.ok || !result || errorMessage) throw failed(`${response.status} ${errorMessage ?? "respuesta sin resultados"}`);
  return observationsFromAnnotation(result);
}
```

Run: `bunx vitest run server/src/ocr/googleVision.test.ts` → PASS.

- [ ] **Step 3: Elección de proveedor (test primero)**

En `server/src/ingestion/errors.ts`:

```ts
export class UnsupportedImageFormatError extends IngestionError {
  constructor() {
    super("Mandá la imagen como JPG o PNG");
    this.name = "UnsupportedImageFormatError";
  }
}
```

En `server/src/ocr/recognizeImage.test.ts`: agregar `googleApiKey: null, fetch: vi.fn()` a todos los objetos de deps existentes (`darwin(...)` y el de `linux`), y estos casos:

```ts
describe("recognizeImage con Google Vision", () => {
  const google = (fetch: typeof globalThis.fetch): RecognizeImageDeps =>
    ({ platform: "linux", runScript: vi.fn(), googleApiKey: "clave", fetch });

  it("con la key usa Google aunque no sea macOS", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ responses: [{
      fullTextAnnotation: { pages: [{ width: 10, height: 10, blocks: [{ paragraphs: [{ words: [{
        boundingBox: { vertices: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }] }, symbols: [{ text: "Hola" }],
      }] }] }] }] },
    }] }), { status: 200 }));
    expect(await recognizeImage(new Uint8Array([1]), "cupon.png", google(fetch))).toEqual([{ text: "Hola", x: 0.1, y: 0.2, height: 0.2 }]);
  });

  it.each(["foto.heic", "IMG_1234.HEIC", "foto.heif"])("rechaza %s sin llamar a Google", async (fileName) => {
    const fetch = vi.fn();
    await expect(recognizeImage(new Uint8Array([1]), fileName, google(fetch))).rejects.toBeInstanceOf(UnsupportedImageFormatError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

(importar `UnsupportedImageFormatError`.)

Run → FAIL.

`server/src/ocr/recognizeImage.ts`:
- `RecognizeImageDeps` suma `googleApiKey: string | null;` y `fetch: typeof fetch;`.
- `defaultDeps` pasa a función, así lee el entorno en cada llamada:

```ts
const defaultDeps = (): RecognizeImageDeps => ({
  platform: process.platform,
  runScript: runOsascript,
  googleApiKey: process.env.GOOGLE_VISION_API_KEY?.trim() || null,
  fetch: globalThis.fetch,
});

const HEIC_EXTENSION = /\.(heic|heif)$/i;
```

- `recognizeImage(data, fileName, deps: RecognizeImageDeps = defaultDeps())` empieza con:

```ts
  if (deps.googleApiKey) {
    if (HEIC_EXTENSION.test(fileName)) throw new UnsupportedImageFormatError();
    return recognizeWithGoogleVision(data, { apiKey: deps.googleApiKey, fetch: deps.fetch, timeoutMs: GOOGLE_VISION_TIMEOUT_MS });
  }
```

(imports de `./googleVision.js` y del error nuevo.)

Run: `bunx vitest run server/src/ocr server/src/import && bun run typecheck` → PASS.

- [ ] **Step 4: Verificación con el cupón real (con el usuario)**

El usuario activa Cloud Vision API en su proyecto de Google Cloud, con cuenta de facturación y una alerta de presupuesto de USD 1, y crea una API key **restringida a Cloud Vision API**. La guarda en `<scratchpad>/vision.env` como `GOOGLE_VISION_API_KEY=…` (no en el chat).

`<scratchpad>/ocr-check.ts` (no se commitea):

```ts
import { readFileSync } from "node:fs";
import { GOOGLE_VISION_TIMEOUT_MS, recognizeWithGoogleVision } from "<worktree>/server/src/ocr/googleVision.js";
import { toLines } from "<worktree>/server/src/ocr/toLines.js";
import { icbcMortgageImageParser } from "<worktree>/server/src/parsers/icbcMortgageImage.js";

const data = new Uint8Array(readFileSync(process.argv[2] ?? ""));
const lines = toLines(await recognizeWithGoogleVision(data, {
  apiKey: process.env.GOOGLE_VISION_API_KEY ?? "", fetch, timeoutMs: GOOGLE_VISION_TIMEOUT_MS,
}));
const expected = readFileSync("<worktree>/server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt", "utf8").trim();
console.log(lines === expected ? "LÍNEAS IGUALES AL FIXTURE" : "LÍNEAS DISTINTAS AL FIXTURE");
const detected = icbcMortgageImageParser.detect(lines);
console.log(detected ? "PARSER: detecta" : "PARSER: NO detecta");
if (detected) {
  const viaGoogle = icbcMortgageImageParser.parse(lines);
  const viaFixture = icbcMortgageImageParser.parse(expected);
  console.log(JSON.stringify(viaGoogle) === JSON.stringify(viaFixture) ? "PARSER: mismo resultado que el fixture" : "PARSER: resultado distinto");
}
```

Correr con la imagen real (`find ../../../examples -name "2026-09-cuota-14.png"`):

```bash
bunx tsx --env-file=<scratchpad>/vision.env <scratchpad>/ocr-check.ts <ruta-de-la-imagen>
```

Expected: «PARSER: detecta» y «PARSER: mismo resultado que el fixture» (las líneas pueden diferir en espacios). Si el parser no detecta o da otro resultado, ajustar `observationsFromAnnotation` (por ejemplo, unir palabras por párrafo) con un test nuevo que reproduzca la diferencia, y repetir. Si no se puede alinear, frenar y avisar. No mostrar montos del cupón en el chat.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(server): OCR de cupones con Google Vision" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/ocr server/src/ingestion/errors.ts
git push
```

---

### Task 8: Aviso de mails (server)

**Files:**
- Create: `server/src/mail/mailNotice.ts`, `server/src/mail/mailNotice.test.ts`, `server/src/http/routes/mailNotice.test.ts`
- Modify: `server/src/db/models.ts` (`mailNoticeSeenAt`), `shared/src/dtos.ts` (+ test), `server/src/http/routes/mail.ts`

**Interfaces:**
- Produces: `mailNoticeDtoSchema`, `type MailNoticeDTO = { pending: boolean }`; `hasPendingMailNotice(userId: Types.ObjectId, seenAt: Date | null): Promise<boolean>`; `GET /api/mail/notice`, `POST /api/mail/notice/seen` (204).

- [ ] **Step 1: Tests**

`shared/src/dtos.test.ts` (sumar `mailNoticeDtoSchema` al import):

```ts
describe("mailNoticeDtoSchema", () => {
  it("valida el aviso", () => {
    expect(mailNoticeDtoSchema.parse({ pending: true })).toEqual({ pending: true });
    expect(mailNoticeDtoSchema.safeParse({}).success).toBe(false);
  });
});
```

`server/src/mail/mailNotice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { withDb } from "../testing/withDb.js";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";
import { hasPendingMailNotice } from "./mailNotice.js";

withDb();

const USER_ID = new Types.ObjectId();
const SEEN_AT = new Date("2026-10-20T00:00:00Z");

const run = (startedAt: string, overrides: Record<string, unknown> = {}) => MailSyncRunModel.create({
  userId: USER_ID, source: "gmail", trigger: "job", startedAt: new Date(startedAt), finishedAt: new Date(startedAt),
  status: "ok", error: null, messagesChecked: 1, hasMore: false, ...overrides,
});

const attachment = (runId: Types.ObjectId, outcome: string, messageId = "m1") => MailAttachmentModel.create({
  userId: USER_ID, source: "gmail", messageId, partId: "1", runId, fileName: "a.pdf", receivedAt: new Date(),
  outcome, kind: null, documentId: null, detail: "x", processedAt: new Date(),
});

describe("hasPendingMailNotice", () => {
  it("sin corridas no hay aviso", async () => {
    expect(await hasPendingMailNotice(USER_ID, null)).toBe(false);
  });

  it("una corrida automática que importó algo prende el aviso", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z");
    await attachment(_id, "imported");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(true);
  });

  it("un adjunto fallido también lo prende", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z");
    await attachment(_id, "failed");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(true);
  });

  it("una corrida con error lo prende aunque no tenga adjuntos", async () => {
    await run("2026-10-21T00:30:00Z", { status: "error", error: "Gmail respondió 500." });
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(true);
  });

  it("una corrida sin novedades no lo prende", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z");
    await attachment(_id, "duplicate");
    await attachment(_id, "skipped", "m2");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(false);
  });

  it("una corrida manual no lo prende", async () => {
    const { _id } = await run("2026-10-21T00:30:00Z", { trigger: "manual" });
    await attachment(_id, "imported");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(false);
  });

  it("lo que pasó antes de verlo no lo prende", async () => {
    const { _id } = await run("2026-10-19T00:30:00Z");
    await attachment(_id, "imported");
    expect(await hasPendingMailNotice(USER_ID, SEEN_AT)).toBe(false);
    expect(await hasPendingMailNotice(USER_ID, null)).toBe(true);
  });
});
```

`server/src/http/routes/mailNotice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withDb } from "../../testing/withDb.js";
import { TEST_AUTH_CONFIG, TEST_OTHER_EMAIL, withAuthedApi } from "../../testing/auth.js";
import { MailSyncRunModel, UserModel } from "../../db/models.js";
import { createApp } from "../app.js";

withDb();
const app = createApp(TEST_AUTH_CONFIG);
const owner = withAuthedApi(app);
const other = withAuthedApi(app, TEST_OTHER_EMAIL);

describe("/api/mail/notice", () => {
  it("con una corrida automática con error hay aviso, y al marcarlo visto se apaga", async () => {
    await MailSyncRunModel.create({
      userId: owner.userId, source: "icloud", trigger: "job", startedAt: new Date(Date.now() - 60_000), finishedAt: new Date(),
      status: "error", error: "iCloud rechazó la contraseña", messagesChecked: 0, hasMore: false,
    });
    expect((await owner.api.get("/api/mail/notice")).body).toEqual({ pending: true });
    expect((await owner.api.post("/api/mail/notice/seen")).status).toBe(204);
    expect((await owner.api.get("/api/mail/notice")).body).toEqual({ pending: false });
    expect((await UserModel.findById(owner.userId).lean())?.mailNoticeSeenAt).toBeInstanceOf(Date);
  });

  it("quien no es owner recibe 403", async () => {
    expect((await other.api.get("/api/mail/notice")).status).toBe(403);
    expect((await other.api.post("/api/mail/notice/seen")).status).toBe(403);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implementar**

`shared/src/dtos.ts`: después de `meDtoSchema`:

```ts
export const mailNoticeDtoSchema = z.object({ pending: z.boolean() });
```

y al final `export type MailNoticeDTO = z.infer<typeof mailNoticeDtoSchema>;`.

`server/src/db/models.ts`, en `userSchema`: `mailNoticeSeenAt: { type: Date, default: null },`.

`server/src/mail/mailNotice.ts`:

```ts
import type { Types } from "mongoose";
import { MailAttachmentModel, MailSyncRunModel } from "../db/models.js";

const NOTICE_OUTCOMES = ["imported", "failed"];

export async function hasPendingMailNotice(userId: Types.ObjectId, seenAt: Date | null): Promise<boolean> {
  const since = seenAt ? { startedAt: { $gt: seenAt } } : {};
  const runs = await MailSyncRunModel.find({ userId, trigger: "job", ...since }, { _id: 1, status: 1 }).lean();
  if (runs.some(({ status }) => status === "error")) return true;
  if (runs.length === 0) return false;
  const runIds = runs.map(({ _id }) => _id);
  return (await MailAttachmentModel.exists({ userId, runId: { $in: runIds }, outcome: { $in: NOTICE_OUTCOMES } })) !== null;
}
```

`server/src/http/routes/mail.ts` (imports: `UserModel`, `hasPendingMailNotice`, `type MailNoticeDTO`):

```ts
mailRouter.get("/notice", asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const user = await UserModel.findById(userId, { mailNoticeSeenAt: 1 }).lean();
  const body: MailNoticeDTO = { pending: await hasPendingMailNotice(userId, user?.mailNoticeSeenAt ?? null) };
  res.json(body);
}));

mailRouter.post("/notice/seen", asyncHandler(async (req, res) => {
  await UserModel.updateOne({ _id: userIdOf(req) }, { $set: { mailNoticeSeenAt: new Date() } });
  res.status(204).end();
}));
```

(Van antes de `/:source/sync`.)

Run: `bunx vitest run server shared && bun run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(server): aviso de novedades de la búsqueda automática de mails" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/mail/mailNotice.ts server/src/mail/mailNotice.test.ts server/src/http/routes/mailNotice.test.ts server/src/db/models.ts server/src/http/routes/mail.ts shared/src/dtos.ts shared/src/dtos.test.ts
git push
```

---

### Task 9: Aviso de mails (cliente)

**Files:**
- Create: `client/src/components/layout/ImportShortcut.tsx`, `client/src/components/layout/ImportShortcut.test.tsx`
- Modify: `client/src/api/hooks.ts`, `client/src/components/layout/TopActionsPill.tsx`, `client/src/pages/ImportPage.tsx`, `client/src/pages/ImportPage.test.tsx`

**Interfaces:**
- Consumes: `MailNoticeDTO` (Task 8), `useMe` (proyecto de login).
- Produces: `MAIL_NOTICE_KEY = ["mail-notice"] as const`, `useMailNotice(enabled: boolean)`, `useMarkMailNoticeSeen()`.

- [ ] **Step 1: Tests**

`client/src/components/layout/ImportShortcut.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { ME_QUERY_KEY } from "../../auth/useMe.js";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { ImportShortcut } from "./ImportShortcut.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const clientWith = (me: MeDTO): QueryClient => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY_KEY, me);
  return client;
};

const stubNotice = (pending: boolean) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ pending }), { status: 200, headers: { "Content-Type": "application/json" } })));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImportShortcut", () => {
  it("con novedades el owner ve el punto y el aviso en el nombre", async () => {
    stubNotice(true);
    renderWithProviders(<ImportShortcut />, { client: clientWith(OWNER_ME) });
    expect(await screen.findByRole("link", { name: "importar, hay novedades de mails" })).toBeInTheDocument();
  });

  it("sin novedades es el ícono de siempre", async () => {
    stubNotice(false);
    renderWithProviders(<ImportShortcut />, { client: clientWith(OWNER_ME) });
    expect(await screen.findByRole("link", { name: "importar" })).toBeInTheDocument();
  });

  it("a quien no es owner ni le consulta el aviso", () => {
    stubNotice(true);
    renderWithProviders(<ImportShortcut />, { client: clientWith({ ...OWNER_ME, isOwner: false }) });
    expect(screen.getByRole("link", { name: "importar" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
```

En `client/src/pages/ImportPage.test.tsx`:

```tsx
  it("al entrar, el owner marca vistas las novedades de mails", async () => {
    renderWithProviders(<ImportPage />, { client: clientWithMe(OWNER_ME) });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/mail/notice/seen", expect.objectContaining({ method: "POST" })));
  });

  it("quien no es owner no marca nada", async () => {
    renderWithProviders(<ImportPage />, { client: clientWithMe({ ...OWNER_ME, isOwner: false }) });
    await screen.findByRole("heading", { name: "Archivos importados" });
    expect(fetch).not.toHaveBeenCalledWith("/api/mail/notice/seen", expect.anything());
  });
```

Run: `bunx vitest run client/src/components/layout/ImportShortcut.test.tsx client/src/pages/ImportPage.test.tsx` → FAIL.

- [ ] **Step 2: Implementar**

`client/src/api/hooks.ts` (sumar `MailNoticeDTO` al import de tipos):

```ts
export const MAIL_NOTICE_KEY = ["mail-notice"] as const;

export function useMailNotice(enabled: boolean) {
  return useQuery({ queryKey: MAIL_NOTICE_KEY, queryFn: () => apiFetch<MailNoticeDTO>("/mail/notice"), enabled });
}

export function useMarkMailNoticeSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/mail/notice/seen", { method: "POST" }),
    onSuccess: () => qc.setQueryData<MailNoticeDTO>(MAIL_NOTICE_KEY, { pending: false }),
  });
}
```

`client/src/components/layout/ImportShortcut.tsx`:

```tsx
import { NavLink } from "react-router-dom";
import { Badge, IconButton, Tooltip } from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { useMailNotice } from "../../api/hooks.js";
import { useMe } from "../../auth/useMe.js";
import { useNavSearch } from "./useNavSearch.js";

export const ImportShortcut = () => {
  const search = useNavSearch();
  const { data: me } = useMe();
  const { data: notice } = useMailNotice(me?.isOwner === true);
  const pending = notice?.pending === true;
  const label = pending ? "importar, hay novedades de mails" : "importar";
  return (
    <Tooltip title="Importar">
      <IconButton
        component={NavLink}
        to={{ pathname: "/import", search }}
        color="inherit"
        aria-label={label}
        sx={{ "&[aria-current='page']": { color: "primary.main" } }}
      >
        <Badge color="primary" variant="dot" invisible={!pending}>
          <UploadFileOutlinedIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
};
```

`client/src/components/layout/TopActionsPill.tsx`: reemplazar el bloque `<Tooltip title="Importar">…</Tooltip>` por `<ImportShortcut />`, y sacar los imports que quedan sin uso (`NavLink`, `UploadFileOutlinedIcon`, `useNavSearch`).

`client/src/pages/ImportPage.tsx`: importar `useEffect` y `useMarkMailNoticeSeen`, y después de `useMe`:

```tsx
  const { mutate: markMailNoticeSeen } = useMarkMailNoticeSeen();
  const isOwner = me?.isOwner === true;

  useEffect(() => {
    if (isOwner) markMailNoticeSeen();
  }, [isOwner, markMailNoticeSeen]);
```

(y `mailSection` pasa a usar `isOwner`).

Run: `bunx vitest run client && bun run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(client): punto en Importar cuando hay novedades de mails" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- client/src/api/hooks.ts client/src/components/layout/ImportShortcut.tsx client/src/components/layout/ImportShortcut.test.tsx client/src/components/layout/TopActionsPill.tsx client/src/pages/ImportPage.tsx client/src/pages/ImportPage.test.tsx
git push
```

---

### Task 10: Subida web de 4 MB

**Files:**
- Create: `shared/src/uploads.ts`, `server/src/http/uploadFile.ts`
- Modify: `shared/src/index.ts`, `server/src/http/routes/import.ts`, `server/src/http/routes/import.test.ts`, `server/src/http/routes/statements.ts`, `server/src/http/routes/statements.test.ts`, `client/src/components/FileDropzone.tsx`, `client/src/components/FileDropzone.test.tsx`

**Interfaces:**
- Produces: `MAX_UPLOAD_BYTES = 4 * 1024 * 1024`, `UPLOAD_TOO_LARGE = "El archivo supera el máximo de 4 MB"` en `@ledgerly/shared`; `uploadSingleFile(fileFilter?: multer.Options["fileFilter"]): RequestHandler`.

- [ ] **Step 1: Tests**

`server/src/http/routes/import.test.ts`: importar `MAX_UPLOAD_BYTES` y `UPLOAD_TOO_LARGE` de `@ledgerly/shared` (en lugar de `./import.js`) y:

```ts
  it("un archivo de exactamente 4 MB pasa el límite", async () => {
    mocked.mockResolvedValue({ text: "documento cualquiera sin marcadores conocidos", meta });
    const res = await auth.api.post("/api/import").attach("file", Buffer.alloc(MAX_UPLOAD_BYTES, 0x20), "x.pdf");
    expect(res.status).toBe(422);
  });
```

y el test existente de 413 espera `res.body.error` igual a `UPLOAD_TOO_LARGE`.

`server/src/http/routes/statements.test.ts`:

```ts
  it("un archivo de más de 4 MB → 413", async () => {
    const res = await auth.api.post("/api/statements").attach("file", Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x20), "r.pdf");
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: UPLOAD_TOO_LARGE });
  });
```

`client/src/components/FileDropzone.test.tsx`:

```tsx
  it("avisa sin subir un archivo de más de 4 MB y deja pasar uno de exactamente 4 MB", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "grande.pdf", { type: "application/pdf" }));
    expect(screen.getByText(UPLOAD_TOO_LARGE)).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    const exact = new File([new Uint8Array(MAX_UPLOAD_BYTES)], "justo.pdf", { type: "application/pdf" });
    drop(exact);
    expect(onFile).toHaveBeenCalledWith(exact);
    expect(screen.queryByText(UPLOAD_TOO_LARGE)).not.toBeInTheDocument();
  });
```

(usa los helpers `drop` del archivo; sumar `import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE } from "@ledgerly/shared";`.)

Run → FAIL.

- [ ] **Step 2: Implementar**

`shared/src/uploads.ts`:

```ts
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TOO_LARGE = "El archivo supera el máximo de 4 MB";
```

`shared/src/index.ts`: `export * from "./uploads.js";`.

`server/src/http/uploadFile.ts`:

```ts
import type { RequestHandler } from "express";
import multer, { MulterError, type Options } from "multer";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE } from "@ledgerly/shared";
import { HttpError } from "./errors.js";

export function uploadSingleFile(fileFilter?: Options["fileFilter"]): RequestHandler {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }, fileFilter });
  return (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof MulterError) {
        next(err.code === "LIMIT_FILE_SIZE" ? new HttpError(413, UPLOAD_TOO_LARGE) : new HttpError(400, "Subida inválida"));
        return;
      }
      next(err);
    });
  };
}
```

`server/src/http/routes/import.ts`: borrar `MAX_UPLOAD_BYTES`, el `multer(...)` y `uploadFile`; usar `importRouter.post("/", uploadSingleFile(acceptsPdfOrImage), …)` con

```ts
const acceptsPdfOrImage: Options["fileFilter"] = (_req, file, cb) => {
  if (!isPdf(file) && !isImage(file)) {
    cb(new HttpError(400, UNSUPPORTED_FILE));
    return;
  }
  cb(null, true);
};
```

`server/src/http/routes/statements.ts`: borrar `upload` y usar `uploadSingleFile()` en el `POST /`.

`client/src/components/FileDropzone.tsx`: el estado `rejected` pasa a `error: string | null`; `handleFile`:

```tsx
  const handleFile = (file: File) => {
    if (!isAccepted(file)) {
      setError(UNSUPPORTED_FILE);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(UPLOAD_TOO_LARGE);
      return;
    }
    setError(null);
    onFile(file);
  };
```

con `const UNSUPPORTED_FILE = "Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)";` y, antes del `return`, `const errorText = error ? <Typography color="error" variant="body2" sx={{ mt: 2 }}>{error}</Typography> : null;` que reemplaza al bloque `{rejected && (…)}`.

Run: `bunx vitest run server/src/http client/src/components/FileDropzone.test.tsx shared && bun run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: la subida web acepta hasta 4 MB" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- shared/src/uploads.ts shared/src/index.ts server/src/http/uploadFile.ts server/src/http/routes/import.ts server/src/http/routes/import.test.ts server/src/http/routes/statements.ts server/src/http/routes/statements.test.ts client/src/components/FileDropzone.tsx client/src/components/FileDropzone.test.tsx
git push
```

---

### Task 11: Backups de Atlas

**Files:**
- Create: `scripts/backup-atlas.sh`, `scripts/restore-local.sh`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Scripts**

`scripts/backup-atlas.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

fail() { echo "✖ $1" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "Falta $ENV_FILE"
ATLAS_URL="$(grep -E '^ATLAS_URL=' "$ENV_FILE" | head -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[[ -n "$ATLAS_URL" ]] || fail "Falta ATLAS_URL en .env (el string mongodb+srv:// de Atlas)"
command -v docker >/dev/null || fail "Hace falta Docker"

mkdir -p "$REPO_DIR/backups"
NAME="ledgerly-$(date +%F).archive"
docker run --rm -v "$REPO_DIR/backups:/backups" mongo:7 \
  mongodump --uri="$ATLAS_URL" --db=ledgerly --archive="/backups/$NAME"
echo "✓ Backup en backups/$NAME"
```

`scripts/restore-local.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="ledgerly-mongo"

fail() { echo "✖ $1" >&2; exit 1; }

LATEST="$(ls -1t "$REPO_DIR"/backups/ledgerly-*.archive 2>/dev/null | head -n 1 || true)"
[[ -n "$LATEST" ]] || fail "No hay backups en backups/. Corré primero: bun run backup"
docker inspect "$CONTAINER" >/dev/null 2>&1 || fail "No está corriendo $CONTAINER (docker compose up -d)"

docker cp "$LATEST" "$CONTAINER:/tmp/restore.archive"
docker exec "$CONTAINER" mongorestore --archive=/tmp/restore.archive --drop --nsInclude='ledgerly.*'
docker exec "$CONTAINER" rm -f /tmp/restore.archive
echo "✓ Base local restaurada desde $(basename "$LATEST")"
```

`chmod +x scripts/backup-atlas.sh scripts/restore-local.sh`.

`package.json`: `"backup": "bash scripts/backup-atlas.sh"`, `"backup:restore-local": "bash scripts/restore-local.sh"`.

`.gitignore`: `/backups`.

- [ ] **Step 2: Verificar**

```bash
bash -n scripts/backup-atlas.sh && bash -n scripts/restore-local.sh
env -i PATH="$PATH" HOME="$HOME" bash -c 'cd "$(mktemp -d)" && cp -r '"$PWD"'/scripts . && touch .env && bash scripts/backup-atlas.sh' ; echo "exit $?"
```

Expected: sintaxis ok; el segundo comando imprime «✖ Falta ATLAS_URL en .env …» y `exit 1`. El backup real se prueba en la Tarea 13.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: backups de Atlas y restauración local" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts/backup-atlas.sh scripts/restore-local.sh package.json .gitignore
git push
```

---

### Task 12: Adiós al servicio de la Mac; README y `.env.example`

**Files:**
- Delete: `scripts/install-service.sh`, `scripts/deploy.sh`, `scripts/auto-deploy.sh`, `scripts/service-common.sh`, `scripts/test-service-scripts.sh`
- Modify: `package.json`, `README.md`, `.env.example`

- [ ] **Step 1: Borrar**

```bash
git rm scripts/install-service.sh scripts/deploy.sh scripts/auto-deploy.sh scripts/service-common.sh scripts/test-service-scripts.sh
```

`package.json`: sacar `service:install`, `deploy` y `test:scripts`. `grep -rn "service-common\|install-service\|auto-deploy\|test-service-scripts" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs` → sin resultados (salvo el README, que se reescribe abajo).

- [ ] **Step 2: `.env.example`**

- Sacar `# MAIL_SYNC_HOUR=21`.
- La línea de la búsqueda automática pasa a: `# Búsqueda automática de mails (solo en Vercel, por cron): una vez por día, solo entre esos días de cada mes (puede cruzar el fin de mes). La hora la define vercel.json.`
- Sumar:

```
# iCloud en producción: la contraseña de app va acá (en la Mac también sirve el Llavero).
# ICLOUD_APP_PASSWORD=

# Producción (Vercel): secreto con el que Vercel llama a los cron. Aleatorio, 32+ caracteres.
# CRON_SECRET=

# OCR de cupones en imagen con Google Cloud Vision (API key restringida a Cloud Vision).
# GOOGLE_VISION_API_KEY=

# Solo para bun run backup: string mongodb+srv:// de Atlas.
# ATLAS_URL=
```

- [ ] **Step 3: README**

- Reemplazar la sección «Versión publicada (privada)» entera por «Producción en Vercel», con:
  - qué es (Vercel + Atlas; cada merge a `main` deploya; previews sin base);
  - tabla de variables de producción (copiar la del spec, sección «Variables de entorno de producción»);
  - el corte (los 9 pasos del spec, sección «El corte», con los comandos);
  - backups: snapshots diarios de Atlas, `bun run backup` (necesita `ATLAS_URL` en `.env` y Docker) y `bun run backup:restore-local`;
  - disparar un cron a mano: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>.vercel.app/api/cron/mail/icloud`;
  - logs: `bunx vercel logs <url>` y la pestaña Logs del proyecto.
- En «Login»: la redirect URI de producción pasa a `https://<app>.vercel.app/api/auth/google/callback` (la de Tailscale se borra) y la subsección «Puesta en marcha en la versión publicada» se reemplaza por una línea: «Ver Producción en Vercel → El corte».
- En «Importar desde iCloud»: el paso del Llavero queda para desarrollo; en producción la contraseña va en `ICLOUD_APP_PASSWORD`. El paso 5 («Versión publicada…») se reescribe para Vercel: variables `ICLOUD_*` y `MAIL_SYNC_DAYS` en el proyecto; la búsqueda corre a las 21 h de Argentina (±1 h) solo entre esos días; sin notificaciones de macOS: el punto en Importar avisa las novedades.
- En «Importar desde Gmail»: paso 10 igual que iCloud, a las 22 h.
- En «Scripts»: sacar `service:install`, `deploy`, `test:scripts`; sumar `backup` y `backup:restore-local`.
- `grep -n "Tailscale\|launchctl\|Services/ledgerly\|MAIL_SYNC_HOUR\|osascript\|Script Editor" README.md` → solo dentro de «El corte» (pasos 1 y 9).

- [ ] **Step 4: Verificación**

Run: `bun run test && bun run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: adiós al servicio de la Mac; producción en Vercel en el README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- scripts package.json README.md .env.example
git push
```

---

### Task 13: El corte (con el usuario)

Lo hace el usuario con ayuda del agente, siguiendo «Producción en Vercel → El corte» del README. El merge a `main` lo hace el usuario (PR de `feat/deploy-vercel`, que incluye el login). El agente no mergea, no pushea a `main` y no toca la base de producción por su cuenta.

- [ ] **Step 1: Repasar con el usuario los pasos del README** y confirmar la región de Atlas. Si Atlas Free no ofrece São Paulo: cambiar `"regions": ["gru1"]` por `["iad1"]` en `vercel.json`, commitear y pushear antes del merge.
- [ ] **Step 2: Acompañar los pasos 1 a 5** (apagar la Mac, backup local, `migrate:owner`, Atlas + `mongorestore`, proyecto de Vercel con variables, redirect URI, Cloud Vision). Verificar con el usuario, sin mostrar secretos.
- [ ] **Step 3: El usuario mergea** → Vercel deploya `main`.
- [ ] **Step 4: Checklist de verificación** (spec, «Checklist después del deploy»):
  1. Login del owner en la web y en la PWA del iPhone; ver los datos migrados.
  2. Importar un PDF de resumen y un cupón en imagen.
  3. «Buscar» en iCloud y en Gmail a mano.
  4. Disparar cada cron con `curl` y el secreto; ver el punto en Importar y que se apaga al entrar.
  5. Login del otro usuario: arranca vacío y no ve «Mails».
  6. `bun run backup` deja un archivo en `backups/`.
- [ ] **Step 5: Limpieza de la Mac** (paso 9 del corte).
