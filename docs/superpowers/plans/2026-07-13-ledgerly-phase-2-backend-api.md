# Ledgerly — Fase 2: Backend, persistencia y API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sobre el motor de parseo de la Fase 1, agregar persistencia en MongoDB, categorización automática por reglas editables, y una API REST (Express) para importar resúmenes, consultar movimientos/estadísticas y administrar reglas.

**Architecture:** Express (ESM/TS) con `createApp()` inyectable para tests. Mongoose modela `statements`, `transactions`, `categoryRules`. El endpoint de upload usa el `parseStatement` de la Fase 1, aplica reglas, deduplica por `sourceHash` y persiste. Las estadísticas se calculan con aggregation pipelines de Mongo; las cuotas futuras con una función pura en Node. DTOs y schemas de respuesta viven en `@ledgerly/shared` (contrato único para el frontend).

**Tech Stack:** Express 4, multer, mongoose 8, zod, Node ≥ 20 (ESM). Tests: Vitest + supertest + mongodb-memory-server.

## Global Constraints

- Hereda **todas** las constraints de la Fase 1 (Node ≥ 20, ESM `"type":"module"`, TS strict sin `any`, imports con extensión `.js`, sin comentarios en el código, commits diferidos → `git add` y frenar).
- **Depende de la Fase 1**: usa `parseStatement`, los errores tipados y los tipos de `@ledgerly/shared`. No re-implementar parseo.
- **Solo `type: 'purchase'` cuenta como gasto** en toda estadística.
- **Idempotencia**: `sourceHash` único; reimportar el mismo PDF → 200 `duplicate` salvo `?replace=true`.
- **Override manual de categoría** (`categorySource: 'manual'`) nunca lo pisa el motor de reglas.
- **Sin auth** (un solo usuario local). CORS abierto a `http://localhost:5173` (Vite).
- `PARSER_VERSION = "1.0.0"` (constante; se guarda en cada statement).

---

## File Structure

```
server/src/
├─ db/
│  ├─ connection.ts        # connectMongo(url) / disconnectMongo()
│  └─ models.ts            # StatementModel, TransactionModel, CategoryRuleModel (+ interfaces)
├─ http/
│  ├─ app.ts               # createApp(): express.Express (monta routers + error handler)
│  ├─ errors.ts            # HttpError + asyncHandler + errorMiddleware
│  ├─ mappers.ts           # toStatementDTO / toTransactionDTO / toCategoryRuleDTO
│  └─ routes/
│     ├─ statements.ts     # POST / , GET / , GET /:id , DELETE /:id
│     ├─ transactions.ts   # GET / , PATCH /:id
│     ├─ categoryRules.ts  # GET/POST/PATCH/DELETE , POST /apply
│     └─ stats.ts          # by-category | monthly | top-merchants | future-installments | summary
├─ rules/
│  ├─ categorize.ts        # categorize(descriptionRaw, merchant, rules)
│  ├─ seedRules.ts         # SEED_RULES + seedCategoryRules()
│  └─ *.test.ts
├─ stats/
│  ├─ futureInstallments.ts# computeFutureInstallments(txns, currency)
│  └─ futureInstallments.test.ts
├─ import/
│  ├─ importStatement.ts   # servicio: dedupe + categorize + persist
│  └─ importStatement.test.ts
├─ testing/
│  └─ withDb.ts            # helper mongodb-memory-server para tests
└─ index.ts                # entrypoint: connect + createApp().listen(PORT)

shared/src/
└─ dtos.ts                 # schemas zod + tipos de las respuestas de la API (contrato)
```

---

### Task 1: Bootstrap de Express + conexión Mongo + deps

**Files:**
- Modify: `server/package.json` (deps), root `package.json` (scripts)
- Create: `server/src/db/connection.ts`, `server/src/http/errors.ts`, `server/src/http/app.ts`, `server/src/testing/withDb.ts`, `server/src/index.ts`
- Test: `server/src/http/app.test.ts`

**Interfaces:**
- Produces:
  - `createApp(): import("express").Express`
  - `connectMongo(url: string): Promise<void>`, `disconnectMongo(): Promise<void>`
  - `class HttpError extends Error { status: number; constructor(status: number, message: string) }`
  - `asyncHandler(fn)`, `errorMiddleware(err, req, res, next)`
  - `withDb()` (helper de tests: arranca mongodb-memory-server y conecta mongoose)

- [ ] **Step 1: Agregar dependencias**

Editar `server/package.json` → `dependencies` y `devDependencies`:
```json
{
  "name": "@ledgerly/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@ledgerly/shared": "*",
    "unpdf": "^0.12.0",
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1",
    "mongoose": "^8.7.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "mongodb-memory-server": "^10.1.0",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.12",
    "@types/cors": "^2.8.17",
    "@types/supertest": "^6.0.2"
  }
}
```
Editar root `package.json` → agregar scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "dev:server": "tsx watch server/src/index.ts",
    "seed": "tsx server/src/rules/seedRules.ts"
  }
}
```
Run: `npm install`
Expected: instala Express, mongoose, etc.

- [ ] **Step 2: Escribir el test que falla**

`server/src/http/app.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("createApp", () => {
  const app = createApp();

  it("GET /api/health responde ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("una ruta inexistente responde 404 con shape de error", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- app`
Expected: FAIL — `createApp` inexistente.

- [ ] **Step 4: Implementar bootstrap, errores y conexión**

`server/src/http/errors.ts`:
```ts
import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: err instanceof Error ? err.message : "Error interno" });
}
```

`server/src/http/app.ts`:
```ts
import express from "express";
import cors from "cors";
import { errorMiddleware, HttpError } from "./errors.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No encontrado")));
  app.use(errorMiddleware);
  return app;
}
```

`server/src/db/connection.ts`:
```ts
import mongoose from "mongoose";

export async function connectMongo(url: string): Promise<void> {
  await mongoose.connect(url);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
```

`server/src/testing/withDb.ts`:
```ts
import { afterAll, beforeAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

export function withDb(): void {
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db!.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });
}
```

`server/src/index.ts`:
```ts
import { createApp } from "./http/app.js";
import { connectMongo } from "./db/connection.js";

const PORT = Number(process.env.PORT ?? 4000);
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";

await connectMongo(MONGO_URL);
createApp().listen(PORT, () => {
  console.log(`Ledgerly API en http://localhost:${PORT}`);
});
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- app`
Expected: PASS (2 tests).

- [ ] **Step 6: Stage**

```bash
git add server/package.json package.json package-lock.json server/src/http server/src/db server/src/testing server/src/index.ts
# commit sugerido: "feat(server): bootstrap Express + conexión Mongo + helper de tests"
```

---

### Task 2: Modelos Mongoose

**Files:**
- Create: `server/src/db/models.ts`
- Test: `server/src/db/models.test.ts`

**Interfaces:**
- Consumes: tipos de `@ledgerly/shared`.
- Produces: `StatementModel`, `TransactionModel`, `CategoryRuleModel` (modelos mongoose) e interfaces `StatementDoc`, `TransactionDoc`, `CategoryRuleDoc`. `TransactionDoc` agrega `category: string`, `categorySource: 'rule' | 'manual'` a los campos de `ParsedRow` (con `date: Date`). `StatementModel` tiene índice único en `sourceHash`.

- [ ] **Step 1: Escribir el test que falla**

`server/src/db/models.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel } from "./models.js";

withDb();

describe("modelos", () => {
  it("persiste y recupera un statement", async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null,
      closingDate: new Date("2026-07-02"), dueDate: new Date("2026-07-14"),
      totals: { totalConsumos: { ars: 2400, usd: 0 }, saldoActual: { ars: 2400, usd: 0 },
        pagoMinimo: { ars: 240, usd: 0 }, saldoAnterior: { ars: 5000, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "abc", pageCount: 10, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    expect(s._id).toBeDefined();
  });

  it("rechaza sourceHash duplicado", async () => {
    const base = {
      issuer: "icbc" as const, cardLabel: "ICBC", last4: null,
      closingDate: new Date(), dueDate: new Date(),
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "dup", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    };
    await StatementModel.create(base);
    await expect(StatementModel.create(base)).rejects.toThrow();
  });

  it("persiste una transacción con categoría", async () => {
    const tx = await TransactionModel.create({
      statementId: (await StatementModel.findOne())?._id,
      issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "COMERCIO TRES", merchant: "COMERCIO TRES",
      category: "Otros", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase",
      isInstallment: true, installmentCurrent: 2, installmentTotal: 6, comprobante: "001001",
      fingerprint: "fp1",
    });
    expect(tx.category).toBe("Otros");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- models`
Expected: FAIL — `models.js` inexistente.

- [ ] **Step 3: Implementar los modelos**

`server/src/db/models.ts`:
```ts
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const moneyPair = { ars: { type: Number, required: true }, usd: { type: Number, required: true } };

const statementSchema = new Schema(
  {
    issuer: { type: String, required: true, enum: ["visa_signature", "icbc"] },
    cardLabel: { type: String, required: true },
    last4: { type: String, default: null },
    closingDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    totals: {
      totalConsumos: moneyPair,
      saldoActual: moneyPair,
      pagoMinimo: moneyPair,
      saldoAnterior: moneyPair,
    },
    sourceFileName: { type: String, required: true },
    sourceHash: { type: String, required: true, unique: true },
    pageCount: { type: Number, required: true },
    parserVersion: { type: String, required: true },
    needsReview: { type: Boolean, default: false },
    reconciliation: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: "uploadedAt", updatedAt: false } },
);

const transactionSchema = new Schema({
  statementId: { type: Schema.Types.ObjectId, ref: "Statement", required: true, index: true },
  issuer: { type: String, required: true },
  cardLabel: { type: String, required: true },
  date: { type: Date, required: true, index: true },
  descriptionRaw: { type: String, required: true },
  merchant: { type: String, required: true, index: true },
  category: { type: String, required: true, index: true },
  categorySource: { type: String, required: true, enum: ["rule", "manual"] },
  amount: { type: Number, required: true },
  currency: { type: String, required: true, enum: ["ARS", "USD"], index: true },
  direction: { type: String, required: true, enum: ["debit", "credit"] },
  type: { type: String, required: true, index: true },
  isInstallment: { type: Boolean, required: true },
  installmentCurrent: { type: Number, default: null },
  installmentTotal: { type: Number, default: null },
  comprobante: { type: String, default: null },
  fingerprint: { type: String, required: true },
});

const categoryRuleSchema = new Schema({
  priority: { type: Number, required: true },
  matchType: { type: String, required: true, enum: ["contains", "regex"] },
  pattern: { type: String, required: true },
  category: { type: String, required: true },
  source: { type: String, required: true, enum: ["system", "user"] },
  enabled: { type: Boolean, default: true },
});

export type StatementDoc = InferSchemaType<typeof statementSchema>;
export type TransactionDoc = InferSchemaType<typeof transactionSchema>;
export type CategoryRuleDoc = InferSchemaType<typeof categoryRuleSchema>;

export const StatementModel: Model<StatementDoc> =
  mongoose.models.Statement ?? mongoose.model("Statement", statementSchema);
export const TransactionModel: Model<TransactionDoc> =
  mongoose.models.Transaction ?? mongoose.model("Transaction", transactionSchema);
export const CategoryRuleModel: Model<CategoryRuleDoc> =
  mongoose.models.CategoryRule ?? mongoose.model("CategoryRule", categoryRuleSchema);
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- models`
Expected: PASS (3 tests). El de `sourceHash` duplicado requiere el índice único; si falla por timing del índice, agregar `await StatementModel.init()` antes del segundo `create`.

- [ ] **Step 5: Stage**

```bash
git add server/src/db/models.ts server/src/db/models.test.ts
# commit sugerido: "feat(server): modelos Mongoose (statements/transactions/categoryRules)"
```

---

### Task 3: DTOs compartidos + mappers

**Files:**
- Create: `shared/src/dtos.ts`
- Modify: `shared/src/index.ts` (export dtos)
- Create: `server/src/http/mappers.ts`
- Test: `server/src/http/mappers.test.ts`

**Interfaces:**
- Produces (en `@ledgerly/shared`): `TransactionDTO`, `StatementDTO`, `CategoryRuleDTO`, `ImportResultDTO`, `CategoryStat`, `MonthlyStat`, `MerchantStat`, `FutureInstallmentStat`, `SummaryStat` (+ sus schemas zod).
- Produces (server): `toTransactionDTO(doc)`, `toStatementDTO(doc, transactionCount)`, `toCategoryRuleDTO(doc)`.

- [ ] **Step 1: Escribir el DTO contract (shared)**

`shared/src/dtos.ts`:
```ts
import { z } from "zod";
import {
  currencySchema, directionSchema, issuerSchema, txTypeSchema,
  reconciliationResultSchema, parsedTotalsSchema,
} from "./schemas.js";

export const transactionDtoSchema = z.object({
  id: z.string(),
  statementId: z.string(),
  issuer: issuerSchema,
  cardLabel: z.string(),
  date: z.string(),
  descriptionRaw: z.string(),
  merchant: z.string(),
  category: z.string(),
  categorySource: z.enum(["rule", "manual"]),
  amount: z.number(),
  currency: currencySchema,
  direction: directionSchema,
  type: txTypeSchema,
  isInstallment: z.boolean(),
  installmentCurrent: z.number().nullable(),
  installmentTotal: z.number().nullable(),
  comprobante: z.string().nullable(),
});

export const statementDtoSchema = z.object({
  id: z.string(),
  issuer: issuerSchema,
  cardLabel: z.string(),
  last4: z.string().nullable(),
  closingDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  totals: parsedTotalsSchema,
  sourceFileName: z.string(),
  needsReview: z.boolean(),
  reconciliation: reconciliationResultSchema,
  transactionCount: z.number(),
  uploadedAt: z.string(),
});

export const categoryRuleDtoSchema = z.object({
  id: z.string(),
  priority: z.number(),
  matchType: z.enum(["contains", "regex"]),
  pattern: z.string(),
  category: z.string(),
  source: z.enum(["system", "user"]),
  enabled: z.boolean(),
});

export const importResultDtoSchema = z.object({
  status: z.enum(["imported", "duplicate"]),
  statement: statementDtoSchema,
  transactionCount: z.number(),
});

export const categoryStatSchema = z.object({ category: z.string(), total: z.number(), count: z.number() });
export const monthlyStatSchema = z.object({ month: z.string(), total: z.number(), count: z.number() });
export const merchantStatSchema = z.object({ merchant: z.string(), total: z.number(), count: z.number() });
export const futureInstallmentStatSchema = z.object({ month: z.string(), total: z.number() });
export const summaryStatSchema = z.object({
  currency: currencySchema,
  totalPurchases: z.number(),
  transactionCount: z.number(),
  statementCount: z.number(),
  futureInstallmentTotal: z.number(),
});

export type TransactionDTO = z.infer<typeof transactionDtoSchema>;
export type StatementDTO = z.infer<typeof statementDtoSchema>;
export type CategoryRuleDTO = z.infer<typeof categoryRuleDtoSchema>;
export type ImportResultDTO = z.infer<typeof importResultDtoSchema>;
export type CategoryStat = z.infer<typeof categoryStatSchema>;
export type MonthlyStat = z.infer<typeof monthlyStatSchema>;
export type MerchantStat = z.infer<typeof merchantStatSchema>;
export type FutureInstallmentStat = z.infer<typeof futureInstallmentStatSchema>;
export type SummaryStat = z.infer<typeof summaryStatSchema>;
```

Agregar a `shared/src/index.ts`:
```ts
export * from "./dtos.js";
```

- [ ] **Step 2: Escribir el test que falla (mappers)**

`server/src/http/mappers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withDb } from "../testing/withDb.js";
import { StatementModel, TransactionModel } from "../db/models.js";
import { toStatementDTO, toTransactionDTO } from "./mappers.js";
import { statementDtoSchema, transactionDtoSchema } from "@ledgerly/shared";

withDb();

describe("mappers", () => {
  it("toTransactionDTO cumple el schema y serializa la fecha a ISO", async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "h1", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    const tx = await TransactionModel.create({
      statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "X", merchant: "X", category: "Otros", categorySource: "rule",
      amount: 100, currency: "ARS", direction: "debit", type: "purchase",
      isInstallment: false, installmentCurrent: null, installmentTotal: null,
      comprobante: null, fingerprint: "fp",
    });
    const dto = toTransactionDTO(tx);
    expect(() => transactionDtoSchema.parse(dto)).not.toThrow();
    expect(dto.date).toBe("2026-05-04");
    expect(dto.id).toBe(tx._id.toString());
  });

  it("toStatementDTO cumple el schema", async () => {
    const s = await StatementModel.findOne();
    const dto = toStatementDTO(s!, 3);
    expect(() => statementDtoSchema.parse(dto)).not.toThrow();
    expect(dto.transactionCount).toBe(3);
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npm test -- mappers`
Expected: FAIL — `mappers.js` inexistente.

- [ ] **Step 4: Implementar los mappers**

`server/src/http/mappers.ts`:
```ts
import type { CategoryRuleDTO, StatementDTO, TransactionDTO } from "@ledgerly/shared";
import type { CategoryRuleDoc, StatementDoc, TransactionDoc } from "../db/models.js";
import type { HydratedDocument } from "mongoose";

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function toTransactionDTO(doc: HydratedDocument<TransactionDoc>): TransactionDTO {
  return {
    id: doc._id.toString(),
    statementId: doc.statementId.toString(),
    issuer: doc.issuer as TransactionDTO["issuer"],
    cardLabel: doc.cardLabel,
    date: doc.date.toISOString().slice(0, 10),
    descriptionRaw: doc.descriptionRaw,
    merchant: doc.merchant,
    category: doc.category,
    categorySource: doc.categorySource as TransactionDTO["categorySource"],
    amount: doc.amount,
    currency: doc.currency as TransactionDTO["currency"],
    direction: doc.direction as TransactionDTO["direction"],
    type: doc.type as TransactionDTO["type"],
    isInstallment: doc.isInstallment,
    installmentCurrent: doc.installmentCurrent ?? null,
    installmentTotal: doc.installmentTotal ?? null,
    comprobante: doc.comprobante ?? null,
  };
}

export function toStatementDTO(doc: HydratedDocument<StatementDoc>, transactionCount: number): StatementDTO {
  return {
    id: doc._id.toString(),
    issuer: doc.issuer as StatementDTO["issuer"],
    cardLabel: doc.cardLabel,
    last4: doc.last4 ?? null,
    closingDate: isoDate(doc.closingDate ?? null),
    dueDate: isoDate(doc.dueDate ?? null),
    totals: doc.totals as StatementDTO["totals"],
    sourceFileName: doc.sourceFileName,
    needsReview: doc.needsReview,
    reconciliation: doc.reconciliation as StatementDTO["reconciliation"],
    transactionCount,
    uploadedAt: (doc as unknown as { uploadedAt: Date }).uploadedAt.toISOString(),
  };
}

export function toCategoryRuleDTO(doc: HydratedDocument<CategoryRuleDoc>): CategoryRuleDTO {
  return {
    id: doc._id.toString(),
    priority: doc.priority,
    matchType: doc.matchType as CategoryRuleDTO["matchType"],
    pattern: doc.pattern,
    category: doc.category,
    source: doc.source as CategoryRuleDTO["source"],
    enabled: doc.enabled,
  };
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npm test -- mappers`
Expected: PASS (2 tests). `npm run typecheck` sin errores.

- [ ] **Step 6: Stage**

```bash
git add shared/src/dtos.ts shared/src/index.ts server/src/http/mappers.ts server/src/http/mappers.test.ts
# commit sugerido: "feat: DTOs de la API compartidos + mappers"
```

---

### Task 4: Motor de categorización + seed

**Files:**
- Create: `server/src/rules/categorize.ts`, `server/src/rules/seedRules.ts`
- Test: `server/src/rules/categorize.test.ts`

**Interfaces:**
- Consumes: `CategoryRuleDoc`.
- Produces:
  - `interface RuleInput { matchType: "contains" | "regex"; pattern: string; category: string; priority: number; enabled: boolean }`
  - `categorize(descriptionRaw: string, merchant: string, rules: RuleInput[]): { category: string; source: "rule" }` — aplica la primera regla habilitada (ordenadas por `priority` asc) que matchea; default `"Sin categoría"`.
  - `SEED_RULES: Omit<RuleInput, "enabled">[]` (con `source: "system"`), `seedCategoryRules(): Promise<number>` (inserta las que falten; idempotente).

- [ ] **Step 1: Escribir el test que falla**

`server/src/rules/categorize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { categorize, SEED_RULES } from "./categorize.js";
import type { RuleInput } from "./categorize.js";

const rules: RuleInput[] = [
  { priority: 1, matchType: "contains", pattern: "NETFLIX", category: "Suscripciones", enabled: true },
  { priority: 2, matchType: "regex", pattern: "SUBE|UBER", category: "Transporte", enabled: true },
  { priority: 3, matchType: "contains", pattern: "DISABLED", category: "Nunca", enabled: false },
];

describe("categorize", () => {
  it("matchea 'contains' sin importar mayúsculas", () => {
    expect(categorize("NETFLIX.COM 12345", "NETFLIX.COM", rules)).toEqual({ category: "Suscripciones", source: "rule" });
  });
  it("matchea 'regex'", () => {
    expect(categorize("SUBE VIAJES - BUSES", "SUBE VIAJES", rules)).toEqual({ category: "Transporte", source: "rule" });
  });
  it("ignora reglas deshabilitadas y cae en Sin categoría", () => {
    expect(categorize("DISABLED COMERCIO", "DISABLED", rules)).toEqual({ category: "Sin categoría", source: "rule" });
  });
  it("respeta la prioridad (menor primero)", () => {
    const r: RuleInput[] = [
      { priority: 5, matchType: "contains", pattern: "CAFE", category: "B", enabled: true },
      { priority: 1, matchType: "contains", pattern: "CAFE", category: "A", enabled: true },
    ];
    expect(categorize("BICHO CAFE", "BICHO CAFE", r).category).toBe("A");
  });
});

describe("SEED_RULES", () => {
  it("trae reglas de sistema con categoría", () => {
    expect(SEED_RULES.length).toBeGreaterThan(3);
    expect(SEED_RULES.every((r) => r.category && r.pattern)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- categorize`
Expected: FAIL — `categorize.js` inexistente.

- [ ] **Step 3: Implementar motor y seed**

`server/src/rules/categorize.ts`:
```ts
export interface RuleInput {
  priority: number;
  matchType: "contains" | "regex";
  pattern: string;
  category: string;
  enabled: boolean;
}

export function categorize(
  descriptionRaw: string,
  merchant: string,
  rules: RuleInput[],
): { category: string; source: "rule" } {
  const haystack = `${descriptionRaw} ${merchant}`.toUpperCase();
  const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    const matched =
      rule.matchType === "contains"
        ? haystack.includes(rule.pattern.toUpperCase())
        : new RegExp(rule.pattern, "i").test(haystack);
    if (matched) return { category: rule.category, source: "rule" };
  }
  return { category: "Sin categoría", source: "rule" };
}

export const SEED_RULES: Omit<RuleInput, "enabled">[] = [
  { priority: 10, matchType: "regex", pattern: "NETFLIX|SPOTIFY|YOUTUBE|APPLE\\.COM|GOOGLE \\*|HBO|DISNEY", category: "Suscripciones" },
  { priority: 20, matchType: "regex", pattern: "SUBE|UBER|CABIFY|DIDI", category: "Transporte" },
  { priority: 30, matchType: "regex", pattern: "PEDIDOSYA|RAPPI|CAFE|BAR|RESTO|HELAD|WORKPLACE|RAPANUI", category: "Comida" },
  { priority: 40, matchType: "regex", pattern: "CARREFOUR|COTO|DIA|JUMBO|MARKET|SUPER", category: "Supermercado" },
  { priority: 50, matchType: "regex", pattern: "PHARMACIE|FARMACIA|FIBRAHUMANA", category: "Salud" },
  { priority: 60, matchType: "regex", pattern: "MERCADOLIBRE|MERCADOPAGO|MEGATONE|TIENDA", category: "Compras" },
  { priority: 70, matchType: "regex", pattern: "ELECTRICIDAD|GAS|AGUA|EDESUR|EDENOR", category: "Servicios" },
];
```

`server/src/rules/seedRules.ts`:
```ts
import { CategoryRuleModel } from "../db/models.js";
import { connectMongo, disconnectMongo } from "../db/connection.js";
import { SEED_RULES } from "./categorize.js";

export async function seedCategoryRules(): Promise<number> {
  let inserted = 0;
  for (const rule of SEED_RULES) {
    const exists = await CategoryRuleModel.findOne({ pattern: rule.pattern, source: "system" });
    if (!exists) {
      await CategoryRuleModel.create({ ...rule, source: "system", enabled: true });
      inserted += 1;
    }
  }
  return inserted;
}

if (process.argv[1]?.endsWith("seedRules.ts")) {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ledgerly";
  await connectMongo(url);
  const n = await seedCategoryRules();
  console.log(`Reglas insertadas: ${n}`);
  await disconnectMongo();
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- categorize`
Expected: PASS (5 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/rules/categorize.ts server/src/rules/seedRules.ts server/src/rules/categorize.test.ts
# commit sugerido: "feat(rules): motor de categorización por reglas + seed"
```

---

### Task 5: Servicio de importación (dedupe + categorizar + persistir)

**Files:**
- Create: `server/src/import/importStatement.ts`
- Test: `server/src/import/importStatement.test.ts`

**Interfaces:**
- Consumes: `parseStatement` (Fase 1), modelos, `categorize`.
- Produces:
  - `PARSER_VERSION = "1.0.0"`
  - `fingerprintOf(issuer, dateIso, comprobante, amount, currency): string`
  - `importStatement(input: { data: Uint8Array; fileName: string; replace?: boolean }): Promise<{ status: "imported" | "duplicate"; statementId: string; transactionCount: number }>` — hashea, corta si duplicado (salvo replace), parsea, categoriza (respetando overrides manuales que no existen aún en import), persiste statement + transacciones.

- [ ] **Step 1: Escribir el test que falla (mock de parseStatement)**

`server/src/import/importStatement.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withDb } from "../testing/withDb.js";
import type { ParsedStatement } from "@ledgerly/shared";

vi.mock("../ingestion/parseStatement.js", () => ({ parseStatement: vi.fn() }));
import { parseStatement } from "../ingestion/parseStatement.js";
import { importStatement } from "./importStatement.js";
import { StatementModel, TransactionModel } from "../db/models.js";

withDb();
const mocked = vi.mocked(parseStatement);

const parsed: ParsedStatement = {
  header: {
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: "2026-07-02", dueDate: "2026-07-14",
    totals: { totalConsumos: { ars: 2400, usd: 0 }, saldoActual: { ars: 2400, usd: 0 },
      pagoMinimo: { ars: 240, usd: 0 }, saldoAnterior: { ars: 5000, usd: 0 } },
  },
  rows: [
    { date: "2026-05-04", descriptionRaw: "MERPAGO*MERCADOLIBRE", merchant: "MERCADOLIBRE", amount: 1500,
      currency: "ARS", direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 2,
      installmentTotal: 6, comprobante: "001001" },
    { date: "2026-06-08", descriptionRaw: "SU PAGO EN PESOS", merchant: "SU PAGO EN PESOS", amount: 5000,
      currency: "ARS", direction: "credit", type: "payment", isInstallment: false, installmentCurrent: null,
      installmentTotal: null, comprobante: null },
  ],
};

beforeEach(() => {
  mocked.mockResolvedValue({ statement: parsed, reconciliation: { ok: true, entries: [] },
    meta: { producer: null, creator: null, pageCount: 10, encrypted: true } });
});

describe("importStatement", () => {
  it("importa statement + transacciones y categoriza", async () => {
    const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    expect(res.status).toBe("imported");
    expect(res.transactionCount).toBe(2);
    expect(await StatementModel.countDocuments()).toBe(1);
    const ml = await TransactionModel.findOne({ comprobante: "001001" });
    expect(ml?.category).toBe("Compras");
    expect(ml?.categorySource).toBe("rule");
  });

  it("es idempotente: reimportar el mismo PDF no duplica", async () => {
    await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    expect(res.status).toBe("duplicate");
    expect(await StatementModel.countDocuments()).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(2);
  });

  it("replace=true reemplaza el statement anterior", async () => {
    await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
    const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf", replace: true });
    expect(res.status).toBe("imported");
    expect(await StatementModel.countDocuments()).toBe(1);
    expect(await TransactionModel.countDocuments()).toBe(2);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- importStatement`
Expected: FAIL — `importStatement.js` inexistente.

- [ ] **Step 3: Implementar el servicio**

`server/src/import/importStatement.ts`:
```ts
import { createHash } from "node:crypto";
import { parseStatement } from "../ingestion/parseStatement.js";
import { CategoryRuleModel, StatementModel, TransactionModel } from "../db/models.js";
import { categorize, type RuleInput } from "../rules/categorize.js";

export const PARSER_VERSION = "1.0.0";

export function fingerprintOf(
  issuer: string, dateIso: string, comprobante: string | null, amount: number, currency: string,
): string {
  return createHash("sha256")
    .update(`${issuer}|${dateIso}|${comprobante ?? ""}|${amount}|${currency}`)
    .digest("hex");
}

export async function importStatement(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
}): Promise<{ status: "imported" | "duplicate"; statementId: string; transactionCount: number }> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");

  const existing = await StatementModel.findOne({ sourceHash });
  if (existing && !input.replace) {
    return {
      status: "duplicate",
      statementId: existing._id.toString(),
      transactionCount: await TransactionModel.countDocuments({ statementId: existing._id }),
    };
  }
  if (existing && input.replace) {
    await TransactionModel.deleteMany({ statementId: existing._id });
    await StatementModel.deleteOne({ _id: existing._id });
  }

  const { statement, reconciliation, meta } = await parseStatement(input.data);
  const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];

  const created = await StatementModel.create({
    issuer: statement.header.issuer,
    cardLabel: statement.header.cardLabel,
    last4: statement.header.last4,
    closingDate: statement.header.closingDate ? new Date(statement.header.closingDate) : null,
    dueDate: statement.header.dueDate ? new Date(statement.header.dueDate) : null,
    totals: statement.header.totals,
    sourceFileName: input.fileName,
    sourceHash,
    pageCount: meta.pageCount,
    parserVersion: PARSER_VERSION,
    needsReview: !reconciliation.ok,
    reconciliation,
  });

  const docs = statement.rows.map((row) => {
    const { category, source } = categorize(row.descriptionRaw, row.merchant, rules);
    return {
      statementId: created._id,
      issuer: statement.header.issuer,
      cardLabel: statement.header.cardLabel,
      date: new Date(row.date),
      descriptionRaw: row.descriptionRaw,
      merchant: row.merchant,
      category,
      categorySource: source,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      type: row.type,
      isInstallment: row.isInstallment,
      installmentCurrent: row.installmentCurrent,
      installmentTotal: row.installmentTotal,
      comprobante: row.comprobante,
      fingerprint: fingerprintOf(statement.header.issuer, row.date, row.comprobante, row.amount, row.currency),
    };
  });
  await TransactionModel.insertMany(docs);

  return { status: "imported", statementId: created._id.toString(), transactionCount: docs.length };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- importStatement`
Expected: PASS (3 tests). (La categoría "Compras" viene de la seed rule `MERCADOLIBRE`; las reglas se crean por el test vía `CategoryRuleModel`. Nota: este test NO siembra reglas, así que la primera aserción de categoría requiere sembrar; ver Step 4b.)

- [ ] **Step 4b: Ajuste — sembrar reglas en el test de categorización**

En `importStatement.test.ts`, dentro del primer `it`, sembrar antes de importar:
```ts
import { seedCategoryRules } from "../rules/seedRules.js";
// ...
it("importa statement + transacciones y categoriza", async () => {
  await seedCategoryRules();
  const res = await importStatement({ data: new Uint8Array([1, 2, 3]), fileName: "r.pdf" });
  // ...resto igual
});
```
Run: `npm test -- importStatement`
Expected: PASS (3 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/import/importStatement.ts server/src/import/importStatement.test.ts
# commit sugerido: "feat(import): servicio de importación con dedupe + categorización"
```

---

### Task 6: Rutas de statements (upload + CRUD)

**Files:**
- Create: `server/src/http/routes/statements.ts`
- Modify: `server/src/http/app.ts` (montar router + multer)
- Test: `server/src/http/routes/statements.test.ts`

**Interfaces:**
- Consumes: `importStatement`, modelos, mappers, `HttpError`, `asyncHandler`.
- Produces: `statementsRouter` con:
  - `POST /api/statements` (multipart campo `file`, query `replace`) → 201 `ImportResultDTO` | 200 duplicate | 422 error de parseo.
  - `GET /api/statements` → `StatementDTO[]`
  - `GET /api/statements/:id` → `{ statement: StatementDTO; transactions: TransactionDTO[] }`
  - `DELETE /api/statements/:id` → 204

- [ ] **Step 1: Escribir el test que falla**

`server/src/http/routes/statements.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import type { ParsedStatement } from "@ledgerly/shared";

vi.mock("../../ingestion/parseStatement.js", () => ({ parseStatement: vi.fn() }));
import { parseStatement } from "../../ingestion/parseStatement.js";
import { createApp } from "../app.js";
import { NoTextError } from "../../ingestion/errors.js";

withDb();
const app = createApp();
const mocked = vi.mocked(parseStatement);

const parsed: ParsedStatement = {
  header: { issuer: "visa_signature", cardLabel: "Visa ****1234", last4: "1234",
    closingDate: "2026-07-02", dueDate: "2026-07-13",
    totals: { totalConsumos: { ars: 3700, usd: 50 }, saldoActual: { ars: 3910, usd: 50 },
      pagoMinimo: { ars: 500, usd: 0 }, saldoAnterior: { ars: 1000, usd: 10 } } },
  rows: [{ date: "2026-06-10", descriptionRaw: "COMERCIO UNO", merchant: "COMERCIO UNO", amount: 2500,
    currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: "111111" }],
};

beforeEach(() => {
  mocked.mockResolvedValue({ statement: parsed, reconciliation: { ok: true, entries: [] },
    meta: { producer: null, creator: null, pageCount: 2, encrypted: false } });
});

describe("POST /api/statements", () => {
  it("importa un PDF y devuelve 201", async () => {
    const res = await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("imported");
    expect(res.body.statement.cardLabel).toBe("Visa ****1234");
    expect(res.body.transactionCount).toBe(1);
  });

  it("reimportar devuelve 200 duplicate", async () => {
    await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    const res = await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("duplicate");
  });

  it("error de parseo → 422", async () => {
    mocked.mockRejectedValueOnce(new NoTextError());
    const res = await request(app).post("/api/statements").attach("file", Buffer.from("x"), "x.pdf");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/texto/i);
  });

  it("sin archivo → 400", async () => {
    const res = await request(app).post("/api/statements");
    expect(res.status).toBe(400);
  });
});

describe("GET/DELETE /api/statements", () => {
  it("lista y borra", async () => {
    await request(app).post("/api/statements").attach("file", Buffer.from("pdf"), "r.pdf");
    const list = await request(app).get("/api/statements");
    expect(list.body).toHaveLength(1);
    const id = list.body[0].id;

    const one = await request(app).get(`/api/statements/${id}`);
    expect(one.body.transactions).toHaveLength(1);

    const del = await request(app).delete(`/api/statements/${id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get("/api/statements")).body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- routes/statements`
Expected: FAIL — router no montado.

- [ ] **Step 3: Implementar el router y montarlo**

`server/src/http/routes/statements.ts`:
```ts
import { Router } from "express";
import multer from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importStatement } from "../../import/importStatement.js";
import { StatementModel, TransactionModel } from "../../db/models.js";
import { toStatementDTO, toTransactionDTO } from "../mappers.js";
import {
  NoTextError, NoTransactionsError, UnsupportedFormatError,
} from "../../ingestion/errors.js";

const upload = multer({ storage: multer.memoryStorage() });
export const statementsRouter = Router();

statementsRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
    const replace = req.query.replace === "true";
    try {
      const result = await importStatement({ data: req.file.buffer, fileName: req.file.originalname, replace });
      const doc = await StatementModel.findById(result.statementId);
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
  asyncHandler(async (_req, res) => {
    const docs = await StatementModel.find().sort({ closingDate: -1 });
    const dtos = await Promise.all(
      docs.map(async (d) => toStatementDTO(d, await TransactionModel.countDocuments({ statementId: d._id }))),
    );
    res.json(dtos);
  }),
);

statementsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await StatementModel.findById(req.params.id);
    if (!doc) throw new HttpError(404, "Statement no encontrado");
    const txs = await TransactionModel.find({ statementId: doc._id }).sort({ date: 1 });
    res.json({
      statement: toStatementDTO(doc, txs.length),
      transactions: txs.map(toTransactionDTO),
    });
  }),
);

statementsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await TransactionModel.deleteMany({ statementId: req.params.id });
    await StatementModel.deleteOne({ _id: req.params.id });
    res.status(204).end();
  }),
);
```

Modificar `server/src/http/app.ts` para montar el router (antes del handler 404):
```ts
import express from "express";
import cors from "cors";
import { errorMiddleware, HttpError } from "./errors.js";
import { statementsRouter } from "./routes/statements.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/statements", statementsRouter);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "No encontrado")));
  app.use(errorMiddleware);
  return app;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- routes/statements`
Expected: PASS (6 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/http/routes/statements.ts server/src/http/app.ts server/src/http/routes/statements.test.ts
# commit sugerido: "feat(api): rutas de statements (upload + CRUD)"
```

---

### Task 7: Rutas de transactions (listado con filtros + edición)

**Files:**
- Create: `server/src/http/routes/transactions.ts`
- Modify: `server/src/http/app.ts` (montar)
- Test: `server/src/http/routes/transactions.test.ts`

**Interfaces:**
- Produces: `transactionsRouter`:
  - `GET /api/transactions?from&to&currency&issuer&category&search&page&pageSize` → `{ items: TransactionDTO[]; total: number; page: number; pageSize: number }`
  - `PATCH /api/transactions/:id` body `{ category?: string; type?: TxType }` → `TransactionDTO`. Si viene `category`, setea `categorySource: 'manual'`.
- Consumes: helper `buildTransactionFilter(query)` (interno).

- [ ] **Step 1: Escribir el test que falla**

`server/src/http/routes/transactions.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

async function seed() {
  const s = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany([
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"),
      descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
      amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
      installmentCurrent: null, installmentTotal: null, comprobante: "1", fingerprint: "f1" },
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-06-08"),
      descriptionRaw: "SU PAGO", merchant: "SU PAGO", category: "Sin categoría", categorySource: "rule",
      amount: 5000, currency: "ARS", direction: "credit", type: "payment", isInstallment: false,
      installmentCurrent: null, installmentTotal: null, comprobante: null, fingerprint: "f2" },
  ]);
}

beforeEach(seed);

describe("GET /api/transactions", () => {
  it("lista con total y paginado", async () => {
    const res = await request(app).get("/api/transactions");
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
  });
  it("filtra por category", async () => {
    const res = await request(app).get("/api/transactions?category=Compras");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].merchant).toBe("MERCADOLIBRE");
  });
  it("filtra por rango de fechas", async () => {
    const res = await request(app).get("/api/transactions?from=2026-06-01&to=2026-06-30");
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].type).toBe("payment");
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("cambia la categoría y marca categorySource=manual", async () => {
    const list = await request(app).get("/api/transactions?category=Compras");
    const id = list.body.items[0].id;
    const res = await request(app).patch(`/api/transactions/${id}`).send({ category: "Regalos" });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe("Regalos");
    expect(res.body.categorySource).toBe("manual");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- routes/transactions`
Expected: FAIL — router no montado.

- [ ] **Step 3: Implementar el router y montarlo**

`server/src/http/routes/transactions.ts`:
```ts
import { Router } from "express";
import type { FilterQuery } from "mongoose";
import { HttpError, asyncHandler } from "../errors.js";
import { TransactionModel, type TransactionDoc } from "../../db/models.js";
import { toTransactionDTO } from "../mappers.js";

function buildFilter(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const filter: FilterQuery<TransactionDoc> = {};
  if (typeof q.currency === "string") filter.currency = q.currency;
  if (typeof q.issuer === "string") filter.issuer = q.issuer;
  if (typeof q.category === "string") filter.category = q.category;
  if (typeof q.search === "string") filter.merchant = { $regex: q.search, $options: "i" };
  if (typeof q.from === "string" || typeof q.to === "string") {
    filter.date = {};
    if (typeof q.from === "string") filter.date.$gte = new Date(q.from);
    if (typeof q.to === "string") filter.date.$lte = new Date(q.to);
  }
  return filter;
}

export const transactionsRouter = Router();

transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize ?? 50)));
    const filter = buildFilter(req.query as Record<string, unknown>);
    const [items, total] = await Promise.all([
      TransactionModel.find(filter).sort({ date: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      TransactionModel.countDocuments(filter),
    ]);
    res.json({ items: items.map(toTransactionDTO), total, page, pageSize });
  }),
);

transactionsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const update: Record<string, unknown> = {};
    if (typeof req.body.category === "string") {
      update.category = req.body.category;
      update.categorySource = "manual";
    }
    if (typeof req.body.type === "string") update.type = req.body.type;
    const doc = await TransactionModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) throw new HttpError(404, "Transacción no encontrada");
    res.json(toTransactionDTO(doc));
  }),
);
```

Montar en `app.ts` (agregar import y `app.use("/api/transactions", transactionsRouter)` junto a los otros routers).

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- routes/transactions`
Expected: PASS (4 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/http/routes/transactions.ts server/src/http/app.ts server/src/http/routes/transactions.test.ts
# commit sugerido: "feat(api): rutas de transactions (filtros + edición de categoría)"
```

---

### Task 8: Rutas de category-rules (+ reaplicar)

**Files:**
- Create: `server/src/http/routes/categoryRules.ts`
- Modify: `server/src/http/app.ts` (montar)
- Test: `server/src/http/routes/categoryRules.test.ts`

**Interfaces:**
- Produces: `categoryRulesRouter`:
  - `GET /api/category-rules` → `CategoryRuleDTO[]`
  - `POST /api/category-rules` body `{ priority, matchType, pattern, category }` → 201 `CategoryRuleDTO` (source `user`, enabled true)
  - `PATCH /api/category-rules/:id` → `CategoryRuleDTO`
  - `DELETE /api/category-rules/:id` → 204
  - `POST /api/category-rules/apply` → `{ updated: number }` (recategoriza todas las transacciones **excepto** las `categorySource: 'manual'`)

- [ ] **Step 1: Escribir el test que falla**

`server/src/http/routes/categoryRules.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

describe("category-rules CRUD", () => {
  it("crea, lista, edita y borra", async () => {
    const created = await request(app).post("/api/category-rules")
      .send({ priority: 5, matchType: "contains", pattern: "UBER", category: "Transporte" });
    expect(created.status).toBe(201);
    expect(created.body.source).toBe("user");
    const id = created.body.id;

    expect((await request(app).get("/api/category-rules")).body).toHaveLength(1);

    const patched = await request(app).patch(`/api/category-rules/${id}`).send({ enabled: false });
    expect(patched.body.enabled).toBe(false);

    expect((await request(app).delete(`/api/category-rules/${id}`)).status).toBe(204);
  });
});

describe("POST /api/category-rules/apply", () => {
  it("recategoriza respetando overrides manuales", async () => {
    const s = await StatementModel.create({
      issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: null, dueDate: null,
      totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
        pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
      sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
      needsReview: false, reconciliation: { ok: true, entries: [] },
    });
    await TransactionModel.insertMany([
      { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date(), descriptionRaw: "UBER TRIP",
        merchant: "UBER TRIP", category: "Sin categoría", categorySource: "rule", amount: 100, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
        installmentTotal: null, comprobante: "1", fingerprint: "f1" },
      { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date(), descriptionRaw: "UBER EATS",
        merchant: "UBER EATS", category: "Comida", categorySource: "manual", amount: 200, currency: "ARS",
        direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null,
        installmentTotal: null, comprobante: "2", fingerprint: "f2" },
    ]);
    await request(app).post("/api/category-rules")
      .send({ priority: 1, matchType: "contains", pattern: "UBER", category: "Transporte" });

    const res = await request(app).post("/api/category-rules/apply");
    expect(res.body.updated).toBe(1);
    expect((await TransactionModel.findOne({ comprobante: "1" }))?.category).toBe("Transporte");
    expect((await TransactionModel.findOne({ comprobante: "2" }))?.category).toBe("Comida");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- routes/categoryRules`
Expected: FAIL — router no montado.

- [ ] **Step 3: Implementar el router y montarlo**

`server/src/http/routes/categoryRules.ts`:
```ts
import { Router } from "express";
import { HttpError, asyncHandler } from "../errors.js";
import { CategoryRuleModel, TransactionModel } from "../../db/models.js";
import { toCategoryRuleDTO } from "../mappers.js";
import { categorize, type RuleInput } from "../../rules/categorize.js";

export const categoryRulesRouter = Router();

categoryRulesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rules = await CategoryRuleModel.find().sort({ priority: 1 });
    res.json(rules.map(toCategoryRuleDTO));
  }),
);

categoryRulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { priority, matchType, pattern, category } = req.body;
    if (typeof pattern !== "string" || typeof category !== "string") {
      throw new HttpError(400, "pattern y category son requeridos");
    }
    const doc = await CategoryRuleModel.create({
      priority: Number(priority ?? 100), matchType: matchType === "regex" ? "regex" : "contains",
      pattern, category, source: "user", enabled: true,
    });
    res.status(201).json(toCategoryRuleDTO(doc));
  }),
);

categoryRulesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const doc = await CategoryRuleModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) throw new HttpError(404, "Regla no encontrada");
    res.json(toCategoryRuleDTO(doc));
  }),
);

categoryRulesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await CategoryRuleModel.deleteOne({ _id: req.params.id });
    res.status(204).end();
  }),
);

categoryRulesRouter.post(
  "/apply",
  asyncHandler(async (_req, res) => {
    const rules = (await CategoryRuleModel.find({ enabled: true }).lean()) as unknown as RuleInput[];
    const txs = await TransactionModel.find({ categorySource: { $ne: "manual" } });
    let updated = 0;
    for (const tx of txs) {
      const { category } = categorize(tx.descriptionRaw, tx.merchant, rules);
      if (category !== tx.category) {
        tx.category = category;
        await tx.save();
        updated += 1;
      }
    }
    res.json({ updated });
  }),
);
```

Montar en `app.ts`: `app.use("/api/category-rules", categoryRulesRouter)`.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- routes/categoryRules`
Expected: PASS (2 tests).

- [ ] **Step 5: Stage**

```bash
git add server/src/http/routes/categoryRules.ts server/src/http/app.ts server/src/http/routes/categoryRules.test.ts
# commit sugerido: "feat(api): rutas de category-rules + reaplicar"
```

---

### Task 9: Estadísticas (aggregations + cuotas futuras)

**Files:**
- Create: `server/src/stats/futureInstallments.ts`, `server/src/http/routes/stats.ts`
- Modify: `server/src/http/app.ts` (montar)
- Test: `server/src/stats/futureInstallments.test.ts`, `server/src/http/routes/stats.test.ts`

**Interfaces:**
- Produces:
  - `computeFutureInstallments(txns: { date: string; amount: number; currency: Currency; isInstallment: boolean; installmentCurrent: number | null; installmentTotal: number | null }[], currency: Currency): FutureInstallmentStat[]`
  - `statsRouter`: `GET /by-category`, `/monthly`, `/top-merchants`, `/future-installments`, `/summary` (todos aceptan `currency` (default ARS), `from`, `to`; `top-merchants` acepta `limit`).

- [ ] **Step 1: Escribir el test de cuotas futuras (función pura)**

`server/src/stats/futureInstallments.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeFutureInstallments } from "./futureInstallments.js";

describe("computeFutureInstallments", () => {
  it("proyecta las cuotas restantes a meses futuros", () => {
    const res = computeFutureInstallments(
      [{ date: "2026-05-04", amount: 1000, currency: "ARS", isInstallment: true, installmentCurrent: 2, installmentTotal: 4 }],
      "ARS",
    );
    expect(res).toEqual([
      { month: "2026-06", total: 1000 },
      { month: "2026-07", total: 1000 },
    ]);
  });

  it("ignora no-cuotas, cuotas terminadas y otra moneda", () => {
    const res = computeFutureInstallments(
      [
        { date: "2026-05-04", amount: 500, currency: "ARS", isInstallment: false, installmentCurrent: null, installmentTotal: null },
        { date: "2026-05-04", amount: 500, currency: "ARS", isInstallment: true, installmentCurrent: 6, installmentTotal: 6 },
        { date: "2026-05-04", amount: 9, currency: "USD", isInstallment: true, installmentCurrent: 1, installmentTotal: 3 },
      ],
      "ARS",
    );
    expect(res).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- futureInstallments`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar cuotas futuras**

`server/src/stats/futureInstallments.ts`:
```ts
import type { Currency, FutureInstallmentStat } from "@ledgerly/shared";

interface InstallmentTx {
  date: string;
  amount: number;
  currency: Currency;
  isInstallment: boolean;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

function addMonths(iso: string, months: number): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function computeFutureInstallments(txns: InstallmentTx[], currency: Currency): FutureInstallmentStat[] {
  const buckets = new Map<string, number>();
  for (const tx of txns) {
    if (tx.currency !== currency) continue;
    if (!tx.isInstallment || tx.installmentCurrent === null || tx.installmentTotal === null) continue;
    const remaining = tx.installmentTotal - tx.installmentCurrent;
    for (let k = 1; k <= remaining; k += 1) {
      const month = addMonths(tx.date, k);
      buckets.set(month, (buckets.get(month) ?? 0) + tx.amount);
    }
  }
  return [...buckets.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- futureInstallments`
Expected: PASS (2 tests).

- [ ] **Step 5: Escribir el test de las rutas de stats**

`server/src/http/routes/stats.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { withDb } from "../../testing/withDb.js";
import { createApp } from "../app.js";
import { StatementModel, TransactionModel } from "../../db/models.js";

withDb();
const app = createApp();

beforeEach(async () => {
  const s = await StatementModel.create({
    issuer: "icbc", cardLabel: "ICBC", last4: null, closingDate: new Date("2026-07-02"), dueDate: null,
    totals: { totalConsumos: { ars: 0, usd: 0 }, saldoActual: { ars: 0, usd: 0 },
      pagoMinimo: { ars: 0, usd: 0 }, saldoAnterior: { ars: 0, usd: 0 } },
    sourceFileName: "r.pdf", sourceHash: "h", pageCount: 1, parserVersion: "1.0.0",
    needsReview: false, reconciliation: { ok: true, entries: [] },
  });
  await TransactionModel.insertMany([
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-04"), descriptionRaw: "A",
      merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule", amount: 1500, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: true, installmentCurrent: 2, installmentTotal: 4, comprobante: "1", fingerprint: "f1" },
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-05-10"), descriptionRaw: "B",
      merchant: "UBER", category: "Transporte", categorySource: "rule", amount: 500, currency: "ARS",
      direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "2", fingerprint: "f2" },
    { statementId: s._id, issuer: "icbc", cardLabel: "ICBC", date: new Date("2026-06-08"), descriptionRaw: "PAGO",
      merchant: "SU PAGO", category: "Sin categoría", categorySource: "rule", amount: 9999, currency: "ARS",
      direction: "credit", type: "payment", isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: null, fingerprint: "f3" },
  ]);
});

describe("stats", () => {
  it("by-category suma solo compras", async () => {
    const res = await request(app).get("/api/stats/by-category?currency=ARS");
    const compras = res.body.find((c: { category: string }) => c.category === "Compras");
    expect(compras.total).toBe(1500);
    expect(res.body.some((c: { category: string }) => c.category === "Sin categoría")).toBe(false);
  });

  it("monthly agrupa por mes (solo compras)", async () => {
    const res = await request(app).get("/api/stats/monthly?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-05", total: 2000, count: 2 }]);
  });

  it("top-merchants ordena por gasto", async () => {
    const res = await request(app).get("/api/stats/top-merchants?currency=ARS&limit=5");
    expect(res.body[0].merchant).toBe("MERCADOLIBRE");
  });

  it("future-installments proyecta cuotas", async () => {
    const res = await request(app).get("/api/stats/future-installments?currency=ARS");
    expect(res.body).toEqual([{ month: "2026-06", total: 1500 }, { month: "2026-07", total: 1500 }]);
  });

  it("summary", async () => {
    const res = await request(app).get("/api/stats/summary?currency=ARS");
    expect(res.body.totalPurchases).toBe(2000);
    expect(res.body.transactionCount).toBe(2);
    expect(res.body.statementCount).toBe(1);
    expect(res.body.futureInstallmentTotal).toBe(3000);
  });
});
```

- [ ] **Step 6: Implementar las rutas de stats y montarlas**

`server/src/http/routes/stats.ts`:
```ts
import { Router } from "express";
import type { FilterQuery } from "mongoose";
import { asyncHandler } from "../errors.js";
import { StatementModel, TransactionModel, type TransactionDoc } from "../../db/models.js";
import { computeFutureInstallments } from "../../stats/futureInstallments.js";
import type { Currency } from "@ledgerly/shared";

function baseMatch(q: Record<string, unknown>): FilterQuery<TransactionDoc> {
  const currency = q.currency === "USD" ? "USD" : "ARS";
  const match: FilterQuery<TransactionDoc> = { type: "purchase", currency };
  if (typeof q.from === "string" || typeof q.to === "string") {
    match.date = {};
    if (typeof q.from === "string") match.date.$gte = new Date(q.from);
    if (typeof q.to === "string") match.date.$lte = new Date(q.to);
  }
  return match;
}

export const statsRouter = Router();

statsRouter.get("/by-category", asyncHandler(async (req, res) => {
  const rows = await TransactionModel.aggregate([
    { $match: baseMatch(req.query as Record<string, unknown>) },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, category: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ]);
  res.json(rows);
}));

statsRouter.get("/monthly", asyncHandler(async (req, res) => {
  const rows = await TransactionModel.aggregate([
    { $match: baseMatch(req.query as Record<string, unknown>) },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$date" } }, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, month: "$_id", total: 1, count: 1 } },
    { $sort: { month: 1 } },
  ]);
  res.json(rows);
}));

statsRouter.get("/top-merchants", asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
  const rows = await TransactionModel.aggregate([
    { $match: baseMatch(req.query as Record<string, unknown>) },
    { $group: { _id: "$merchant", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $project: { _id: 0, merchant: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);
  res.json(rows);
}));

statsRouter.get("/future-installments", asyncHandler(async (req, res) => {
  const currency: Currency = req.query.currency === "USD" ? "USD" : "ARS";
  const txs = await TransactionModel.find({ type: "purchase", isInstallment: true }).lean();
  const mapped = txs.map((t) => ({
    date: t.date.toISOString().slice(0, 10),
    amount: t.amount, currency: t.currency as Currency,
    isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent, installmentTotal: t.installmentTotal,
  }));
  res.json(computeFutureInstallments(mapped, currency));
}));

statsRouter.get("/summary", asyncHandler(async (req, res) => {
  const currency: Currency = req.query.currency === "USD" ? "USD" : "ARS";
  const match = baseMatch(req.query as Record<string, unknown>);
  const [agg] = await TransactionModel.aggregate([
    { $match: match },
    { $group: { _id: null, totalPurchases: { $sum: "$amount" }, transactionCount: { $sum: 1 } } },
  ]);
  const installmentTxs = await TransactionModel.find({ type: "purchase", isInstallment: true }).lean();
  const future = computeFutureInstallments(
    installmentTxs.map((t) => ({
      date: t.date.toISOString().slice(0, 10), amount: t.amount, currency: t.currency as Currency,
      isInstallment: t.isInstallment, installmentCurrent: t.installmentCurrent, installmentTotal: t.installmentTotal,
    })),
    currency,
  );
  res.json({
    currency,
    totalPurchases: agg?.totalPurchases ?? 0,
    transactionCount: agg?.transactionCount ?? 0,
    statementCount: await StatementModel.countDocuments(),
    futureInstallmentTotal: future.reduce((acc, f) => acc + f.total, 0),
  });
}));
```

Montar en `app.ts`: `app.use("/api/stats", statsRouter)`.

- [ ] **Step 7: Correr toda la suite + typecheck**

Run:
```bash
npm test
npm run typecheck
```
Expected: todo verde; typecheck sin errores.

- [ ] **Step 8: Stage**

```bash
git add server/src/stats server/src/http/routes/stats.ts server/src/http/app.ts server/src/http/routes/stats.test.ts
# commit sugerido: "feat(api): estadísticas (aggregations + cuotas futuras)"
```

---

## Definition of Done (Fase 2)

- `npm test` verde: modelos, mappers, categorización, import (dedupe), y todas las rutas (statements, transactions, category-rules, stats).
- API arrancable: `docker compose up -d` + `npm run seed` + `npm run dev:server` → endpoints `/api/*` responden.
- Contrato de la API publicado como DTOs en `@ledgerly/shared` (lo consume la Fase 3).
- `npm run typecheck` sin errores; sin `any` salvo los `as unknown as RuleInput[]` puntuales en queries `.lean()`.

**Entregable para la Fase 3:** API REST completa + DTOs tipados en `@ledgerly/shared`.
