# Cupón del crédito desde una imagen — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar la captura mensual del cupón del crédito hipotecario UVA (PNG/JPEG/HEIC) desde la pantalla Importar y guardarla como un `MortgageCoupon` más.

**Architecture:**
- La ruta `POST /api/import` acepta imágenes además de PDF y las manda a `importCouponImage`.
- El pipeline de una imagen:
  1. `recognizeImage` corre el OCR nativo de macOS (Vision, vía `osascript -l JavaScript`).
  2. `toLines` reagrupa las observaciones por fila.
  3. Un parser puro lee los montos.
  4. El importador completa los datos que la captura no trae y guarda con la misma función que el camino PDF (`saveCoupon`, extraída de `importCoupon`).
- El cliente sólo amplía el dropzone.

**Tech Stack:** TypeScript estricto (NodeNext), Express + multer, Mongoose, `@ledgerly/shared`, React + MUI, Vitest + mongodb-memory-server + supertest + Testing Library, `osascript` + Vision (JXA).

**Spec:** `docs/superpowers/specs/2026-10-06-cupon-credito-imagen-design.md`

## Global Constraints

**Dónde se trabaja**
- Todo va en la rama `feat/cupon-credito-imagen`, en el árbol principal del repo (lo eligió el usuario).
- Otras sesiones comparten el árbol. Antes de cada commit correr `git branch --show-current` y `git status --short`, y commitear sólo los archivos de la tarea con pathspec explícito.

**Comandos** (desde la raíz del repo)
- Todo: `bun run test` y `bun run typecheck`.
- Un archivo: `bunx vitest run <ruta>`.

**Estilo de código**
- Sin comentarios en el código (ni `//`, ni bloques, ni JSDoc).
- TypeScript estricto, sin `any` escrito a mano, con tipos de retorno explícitos en lo exportado.
- React: componentes funcionales, destructuring en la firma, la lógica antes del `return`.
- Tests de cliente con `afterEach(cleanup)`: el auto-cleanup de Testing Library está apagado.
- Textos de UI y errores en castellano rioplatense.

**Textos exactos**

| Clave             | Texto                                                  |
|-------------------|--------------------------------------------------------|
| Rechazo de tipo   | `Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)`      |
| Dropzone desktop  | `Arrastrá el PDF o la captura del crédito`             |
| Botón             | `Elegir archivo` (también en mobile)                   |
| OcrUnavailable    | `La lectura de imágenes sólo funciona en macOS`        |
| OcrFailed         | `No se pudo leer el texto de la imagen`                |
| Unrecognized      | `No se reconoció la captura del cupón`                 |
| Totals            | `Los montos leídos no cierran con el total pagado`     |
| MissingPrevious   | `Importá primero un cupón PDF del préstamo`            |

**Tipos y límites**
- Formatos de imagen: mimetypes `image/png`, `image/jpeg`, `image/heic` o extensiones `.png`, `.jpg`, `.jpeg`, `.heic`, sin distinguir mayúsculas.
- Mismo límite de 15 MB que los PDF.

**Dependencias:** ninguna nueva.

**Datos reales**
- Fixtures y tests usan montos y números de préstamo inventados.
- La captura real vive sólo en `examples/credito/imagenes/`, que está gitignoreado y nunca se commitea.

**Commits**
- Uno por tarea, con mensaje `tipo(scope): …` en castellano y el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sólo si el usuario autorizó commitear en esta ejecución. Si no, los cambios quedan en el working tree.
- Nunca `git push`.

**Servers temporales:** nunca en el puerto 4100 (el servicio instalado) ni en 4000/5173 (otras sesiones). Usar 4300+ después de chequear `lsof -iTCP:<puerto> -sTCP:LISTEN`, y matar sólo el PID propio.

## Review Focus

1. **Un dígito mal leído por el OCR.** Si hay un 3 donde iba un 8, el cupón no se guarda: falla con `CouponImageTotalsError` y la base queda igual. → Task 4 («si los montos no cierran…»).
2. **Una imagen que no es la captura del crédito.** Puede ser una foto cualquiera, una captura de otra app o una imagen sin texto. Tiene que dar un 422 con «No se reconoció la captura del cupón», nunca un 500. → Task 4 (tres casos) y Task 5 (422 por la ruta).
3. **La captura del iPhone en HEIC.** Llega con extensión en mayúsculas y mimetype `application/octet-stream` (o sin tipo en el navegador), y se tiene que aceptar. → Task 5 (`IMG_0001.HEIC` octet-stream → 201) y Task 6 (HEIC sin tipo en el dropzone).
4. **Reimportar una cuota que ya existe**, venga de un PDF o de otra captura. Tiene que dar «Ya estaba importado», sin un segundo registro. Con «Reemplazar» se sobrescribe y conserva el N° de préstamo. → Task 4 (duplicate y replace).
5. **Una captura cuando todavía no hay ningún cupón PDF.** Falla con «Importá primero un cupón PDF del préstamo» y no inventa un N° de préstamo. → Task 4 y Task 5.

---

### Task 1: OCR con Vision y armado de líneas

**Files:**
- Create: `server/src/ocr/visionOcr.jxa`
- Create: `server/src/ocr/recognizeImage.ts`
- Create: `server/src/ocr/recognizeImage.test.ts`
- Create: `server/src/ocr/toLines.ts`
- Create: `server/src/ocr/toLines.test.ts`
- Modify: `server/src/ingestion/errors.ts` (al final del archivo)

**Interfaces:**
- Consumes: `IngestionError` de `server/src/ingestion/errors.ts`.
- Produces:
  - `interface OcrObservation { text: string; x: number; y: number; height: number }`, exportada desde `server/src/ocr/recognizeImage.ts`.
  - `interface RecognizeImageDeps { platform: NodeJS.Platform; runScript: (scriptPath: string, imagePath: string) => Promise<string> }`.
  - `recognizeImage(data: Uint8Array, fileName: string, deps?: RecognizeImageDeps): Promise<OcrObservation[]>`.
  - `toLines(observations: OcrObservation[]): string`, en `server/src/ocr/toLines.ts`.
  - `OcrUnavailableError` y `OcrFailedError`, en `server/src/ingestion/errors.ts`.

- [ ] **Step 1: Escribir los tests de `toLines` que fallan**

`server/src/ocr/toLines.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { OcrObservation } from "./recognizeImage.js";
import { toLines } from "./toLines.js";

const obs = (text: string, x: number, y: number, height = 0.03): OcrObservation => ({ text, x, y, height });

describe("toLines", () => {
  it("une el label y el monto de la misma fila en orden de x", () => {
    expect(toLines([obs("$ 1.000,00", 0.78, 0.381), obs("Capital", 0.04, 0.379)])).toBe("Capital $ 1.000,00");
  });

  it("ordena las filas de arriba hacia abajo aunque Vision las devuelva mezcladas", () => {
    const observations = [
      obs("$ 2,00", 0.8, 0.5),
      obs("Capital", 0.04, 0.38),
      obs("Intereses", 0.04, 0.49),
      obs("$ 1,00", 0.8, 0.385),
    ];
    expect(toLines(observations)).toBe("Capital $ 1,00\nIntereses $ 2,00");
  });

  it("separa en filas distintas lo que está a más de media altura", () => {
    expect(toLines([obs("Arriba", 0.04, 0.3), obs("Abajo", 0.04, 0.32)])).toBe("Arriba\nAbajo");
  });

  it("sin observaciones devuelve un texto vacío", () => {
    expect(toLines([])).toBe("");
  });
});
```

En el tercer caso la distancia es 0,02 y la media altura 0,015, así que van en filas distintas.

- [ ] **Step 2: Escribir los tests de `recognizeImage` que fallan**

`server/src/ocr/recognizeImage.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { OcrFailedError, OcrUnavailableError } from "../ingestion/errors.js";
import { recognizeImage, type OcrObservation, type RecognizeImageDeps } from "./recognizeImage.js";

const OBSERVATIONS: OcrObservation[] = [{ text: "Capital", x: 0.04, y: 0.38, height: 0.03 }];

const darwin = (runScript: RecognizeImageDeps["runScript"]): RecognizeImageDeps => ({ platform: "darwin", runScript });

describe("recognizeImage", () => {
  it("fuera de macOS falla con OcrUnavailableError sin correr el script", async () => {
    const runScript = vi.fn(async (_script: string, _imagePath: string): Promise<string> => "[]");
    await expect(recognizeImage(new Uint8Array([1]), "a.png", { platform: "linux", runScript }))
      .rejects.toBeInstanceOf(OcrUnavailableError);
    expect(runScript).not.toHaveBeenCalled();
  });

  it("corre el script de Vision sobre una copia temporal de la imagen y la borra", async () => {
    const copied: number[] = [];
    const runScript = vi.fn(async (_script: string, imagePath: string): Promise<string> => {
      copied.push(...readFileSync(imagePath));
      return JSON.stringify(OBSERVATIONS);
    });
    const result = await recognizeImage(new Uint8Array([7, 8, 9]), "Captura.PNG", darwin(runScript));
    const [script, imagePath] = runScript.mock.calls[0];
    expect(result).toEqual(OBSERVATIONS);
    expect(copied).toEqual([7, 8, 9]);
    expect(basename(script)).toBe("visionOcr.jxa");
    expect(existsSync(script)).toBe(true);
    expect(basename(imagePath)).toBe("imagen.png");
    expect(existsSync(dirname(imagePath))).toBe(false);
  });

  it("no usa una extensión desconocida en el nombre del temporal", async () => {
    const runScript = vi.fn(async (_script: string, _imagePath: string): Promise<string> => "[]");
    await recognizeImage(new Uint8Array([1]), "captura.exe", darwin(runScript));
    expect(basename(runScript.mock.calls[0][1])).toBe("imagen");
  });

  it("si el script falla responde OcrFailedError y borra igual la copia temporal", async () => {
    const runScript = vi.fn(async (_script: string, _imagePath: string): Promise<string> => {
      throw new Error("osascript terminó con error");
    });
    await expect(recognizeImage(new Uint8Array([1]), "a.jpg", darwin(runScript))).rejects.toBeInstanceOf(OcrFailedError);
    expect(existsSync(dirname(runScript.mock.calls[0][1]))).toBe(false);
  });

  it("una salida que no es la lista de observaciones responde OcrFailedError", async () => {
    const notJson = vi.fn(async (_script: string, _imagePath: string): Promise<string> => "no es json");
    const wrongShape = vi.fn(async (_script: string, _imagePath: string): Promise<string> => JSON.stringify([{ text: 1 }]));
    await expect(recognizeImage(new Uint8Array([1]), "a.png", darwin(notJson))).rejects.toBeInstanceOf(OcrFailedError);
    await expect(recognizeImage(new Uint8Array([1]), "a.png", darwin(wrongShape))).rejects.toBeInstanceOf(OcrFailedError);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `bunx vitest run server/src/ocr`
Expected: FAIL porque no se resuelven `./toLines.js`, `./recognizeImage.js` ni los errores nuevos.

- [ ] **Step 4: Agregar los errores de OCR**

Al final de `server/src/ingestion/errors.ts`:

```ts
export class OcrUnavailableError extends IngestionError {
  constructor() {
    super("La lectura de imágenes sólo funciona en macOS");
    this.name = "OcrUnavailableError";
  }
}

export class OcrFailedError extends IngestionError {
  constructor() {
    super("No se pudo leer el texto de la imagen");
    this.name = "OcrFailedError";
  }
}
```

- [ ] **Step 5: Escribir el script de Vision**

`server/src/ocr/visionOcr.jxa`. Es la misma versión que se probó con la captura real: leyó los 15 textos exactos y falla con exit 1 cuando la imagen no existe o no es una imagen.

```js
ObjC.import("Foundation");
ObjC.import("Vision");

function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $({}));
  const request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = 0;
  request.recognitionLanguages = $(["es-ES"]);
  request.usesLanguageCorrection = false;
  const error = Ref();
  if (!handler.performRequestsError($([request]), error)) throw new Error("Vision no pudo procesar la imagen");
  const results = request.results;
  const observations = [];
  for (let i = 0; i < results.count; i++) {
    const observation = results.objectAtIndex(i);
    const box = observation.boundingBox;
    observations.push({
      text: observation.topCandidates(1).objectAtIndex(0).string.js,
      x: box.origin.x,
      y: 1 - box.origin.y - box.size.height / 2,
      height: box.size.height,
    });
  }
  return JSON.stringify(observations);
}
```

- [ ] **Step 6: Implementar `recognizeImage`**

`server/src/ocr/recognizeImage.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OcrFailedError, OcrUnavailableError } from "../ingestion/errors.js";

export interface OcrObservation {
  text: string;
  x: number;
  y: number;
  height: number;
}

export interface RecognizeImageDeps {
  platform: NodeJS.Platform;
  runScript: (scriptPath: string, imagePath: string) => Promise<string>;
}

const SCRIPT_PATH = fileURLToPath(new URL("./visionOcr.jxa", import.meta.url));
const TIMEOUT_MS = 60_000;
const IMAGE_EXTENSION = /^\.(png|jpe?g|heic)$/;

const runOsascript = (scriptPath: string, imagePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", scriptPath, imagePath], { timeout: TIMEOUT_MS }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

const defaultDeps: RecognizeImageDeps = { platform: process.platform, runScript: runOsascript };

const isObservation = (value: unknown): value is OcrObservation => {
  if (typeof value !== "object" || value === null) return false;
  const { text, x, y, height } = value as Record<string, unknown>;
  return typeof text === "string" && [x, y, height].every((n) => typeof n === "number");
};

const parseObservations = (raw: string): OcrObservation[] => {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isObservation)) throw new Error("Salida de Vision inesperada");
  return parsed;
};

const tempName = (fileName: string): string => {
  const extension = extname(fileName).toLowerCase();
  return IMAGE_EXTENSION.test(extension) ? `imagen${extension}` : "imagen";
};

export async function recognizeImage(
  data: Uint8Array,
  fileName: string,
  deps: RecognizeImageDeps = defaultDeps,
): Promise<OcrObservation[]> {
  if (deps.platform !== "darwin") throw new OcrUnavailableError();
  const dir = await mkdtemp(join(tmpdir(), "ledgerly-ocr-"));
  const imagePath = join(dir, tempName(fileName));
  try {
    await writeFile(imagePath, data);
    return parseObservations(await deps.runScript(SCRIPT_PATH, imagePath));
  } catch {
    throw new OcrFailedError();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 7: Implementar `toLines`**

`server/src/ocr/toLines.ts`:

```ts
import type { OcrObservation } from "./recognizeImage.js";

interface Row {
  y: number;
  height: number;
  items: OcrObservation[];
}

const sameRow = (row: Row, observation: OcrObservation): boolean =>
  Math.abs(observation.y - row.y) < Math.max(row.height, observation.height) / 2;

const rowText = (row: Row): string =>
  [...row.items].sort((a, b) => a.x - b.x).map((item) => item.text).join(" ");

export function toLines(observations: OcrObservation[]): string {
  const rows: Row[] = [];
  for (const observation of [...observations].sort((a, b) => a.y - b.y)) {
    const row = rows.at(-1);
    if (row && sameRow(row, observation)) row.items.push(observation);
    else rows.push({ y: observation.y, height: observation.height, items: [observation] });
  }
  return rows.map(rowText).join("\n");
}
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `bunx vitest run server/src/ocr && bun run typecheck`
Expected: PASS (9 tests) y typecheck sin errores.

- [ ] **Step 9: Commit** (sólo con autorización)

```bash
git branch --show-current
git status --short
git add server/src/ocr/visionOcr.jxa server/src/ocr/recognizeImage.ts server/src/ocr/recognizeImage.test.ts server/src/ocr/toLines.ts server/src/ocr/toLines.test.ts server/src/ingestion/errors.ts
git commit -m "feat(server): OCR de imágenes con Vision de macOS" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/ocr server/src/ingestion/errors.ts
```

---

### Task 2: Parser de la captura del crédito

**Files:**
- Modify: `shared/src/types.ts` (después de `MortgageCouponParser`)
- Create: `server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt`
- Create: `server/src/parsers/icbcMortgageImage.ts`
- Create: `server/src/parsers/icbcMortgageImage.test.ts`

**Interfaces:**
- Consumes: `parseArAmount(raw: string): { amount: number; direction }` y `parseSlashDate(raw: string): string` ("DD/MM/AAAA" → "AAAA-MM-DD"), de `server/src/parsers/normalize.ts`.
- Produces:
  - `interface ParsedCouponImage { cuotaNro: number; cuotasTotales: number; fechaDebito: string; capital: number; intereses: number; iva: number; seguros: number; totalPagado: number; totalUva: number }`, en `@ledgerly/shared`.
  - `interface MortgageCouponImageParser { detect(text: string): boolean; parse(text: string): ParsedCouponImage }`, en `@ledgerly/shared`.
  - `icbcMortgageImageParser: MortgageCouponImageParser` y `totalsMatch(parsed: ParsedCouponImage): boolean`, en `server/src/parsers/icbcMortgageImage.ts`.
  - Fixture `server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt`: una línea por fila, tal como la devuelve `toLines`.

- [ ] **Step 1: Crear el fixture sintético**

`server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt`. El `$` va con espacio en unas filas y pegado en otras, como lo devuelve el OCR. Las sumas cierran: 150.000,10 + 1.000.000,20 + 0,00 + 10.000,30 = 1.160.000,60.

```
Cuota 3/240
Vencimiento 17/11/2025
Capital $ 150.000,10
Intereses $1.000.000,20
IVA $ 0,00
Seguros $ 10.000,30
Total pagado $1.160.000,60
Total en UVA UVA 499,90
```

- [ ] **Step 2: Escribir los tests que fallan**

`server/src/parsers/icbcMortgageImage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParsedCouponImage } from "@ledgerly/shared";
import { icbcMortgageImageParser, totalsMatch } from "./icbcMortgageImage.js";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
const text = read("icbc-mortgage-image.sample.txt");
const pdfText = read("icbc-mortgage.sample.txt");
const without = (label: string): string => text.split("\n").filter((line) => !line.startsWith(label)).join("\n");
const { detect, parse } = icbcMortgageImageParser;

describe("icbcMortgageImageParser.detect", () => {
  it("detecta la captura por la cuota y el total en UVA", () => {
    expect(detect(text)).toBe(true);
  });

  it("no confunde el cupón PDF con la captura", () => {
    expect(detect(pdfText)).toBe(false);
  });

  it("no detecta una captura de otra cosa", () => {
    expect(detect("Mercado Pago\nTotal $ 1.000,00")).toBe(false);
  });
});

describe("icbcMortgageImageParser.parse", () => {
  it("lee la cuota, el vencimiento y los montos, con el $ separado o pegado", () => {
    expect(parse(text)).toEqual({
      cuotaNro: 3,
      cuotasTotales: 240,
      fechaDebito: "2025-11-17",
      capital: 150000.1,
      intereses: 1000000.2,
      iva: 0,
      seguros: 10000.3,
      totalPagado: 1160000.6,
      totalUva: 499.9,
    });
  });

  it("falla si falta un monto", () => {
    expect(() => parse(without("Seguros"))).toThrow(/seguros/);
  });

  it("falla si falta la cuota", () => {
    expect(() => parse(without("Cuota"))).toThrow(/cuota/);
  });

  it("falla si el total en UVA es cero", () => {
    expect(() => parse(text.replace("UVA 499,90", "UVA 0,00"))).toThrow(/UVA/);
  });
});

describe("totalsMatch", () => {
  it("da true cuando capital + intereses + IVA + seguros es el total pagado", () => {
    expect(totalsMatch(parse(text))).toBe(true);
  });

  it("da false si un monto se leyó mal", () => {
    expect(totalsMatch(parse(text.replace("$ 10.000,30", "$ 10.000,80")))).toBe(false);
  });

  it("compara en centavos, sin errores de coma flotante", () => {
    const coupon: ParsedCouponImage = {
      cuotaNro: 1, cuotasTotales: 1, fechaDebito: "2025-01-01",
      capital: 0.1, intereses: 0.2, iva: 0, seguros: 0, totalPagado: 0.3, totalUva: 1,
    };
    expect(totalsMatch(coupon)).toBe(true);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `bunx vitest run server/src/parsers/icbcMortgageImage.test.ts`
Expected: FAIL porque no se resuelve `./icbcMortgageImage.js`.

- [ ] **Step 4: Agregar los tipos compartidos**

En `shared/src/types.ts`, inmediatamente después del bloque `export interface MortgageCouponParser { … }`:

```ts
export interface ParsedCouponImage {
  cuotaNro: number;
  cuotasTotales: number;
  fechaDebito: string;
  capital: number;
  intereses: number;
  iva: number;
  seguros: number;
  totalPagado: number;
  totalUva: number;
}

export interface MortgageCouponImageParser {
  detect(text: string): boolean;
  parse(text: string): ParsedCouponImage;
}
```

- [ ] **Step 5: Implementar el parser**

`server/src/parsers/icbcMortgageImage.ts`:

```ts
import type { MortgageCouponImageParser, ParsedCouponImage } from "@ledgerly/shared";
import { parseArAmount, parseSlashDate } from "./normalize.js";

const AMOUNT = String.raw`\$\s*(\d[\d.]*,\d{2})`;
const amountRow = (label: string): RegExp => new RegExp(String.raw`^${label}\s+${AMOUNT}`, "m");

const CUOTA = /^Cuota\s+(\d+)\s*\/\s*(\d+)/m;
const VENCIMIENTO = /^Vencimiento\s+(\d{2}\/\d{2}\/\d{4})/m;
const CAPITAL = amountRow("Capital");
const INTERESES = amountRow("Intereses");
const IVA = amountRow("IVA");
const SEGUROS = amountRow("Seguros");
const TOTAL_PAGADO = amountRow("Total pagado");
const TOTAL_UVA = /^Total en UVA\s+UVA\s*(\d[\d.]*,\d{2})/m;
const TOTAL_UVA_LABEL = "Total en UVA";

const required = (text: string, re: RegExp, field: string): RegExpMatchArray => {
  const found = text.match(re);
  if (!found) throw new Error(`Captura inválida: falta ${field}`);
  return found;
};

const amount = (text: string, re: RegExp, field: string): number =>
  parseArAmount(required(text, re, field)[1]).amount;

const toCents = (value: number): number => Math.round(value * 100);

export const icbcMortgageImageParser: MortgageCouponImageParser = {
  detect(text) {
    return CUOTA.test(text) && text.includes(TOTAL_UVA_LABEL);
  },

  parse(text) {
    const cuota = required(text, CUOTA, "cuota");
    const totalUva = amount(text, TOTAL_UVA, "total en UVA");
    if (totalUva <= 0) throw new Error("Captura inválida: total en UVA en cero");
    return {
      cuotaNro: Number(cuota[1]),
      cuotasTotales: Number(cuota[2]),
      fechaDebito: parseSlashDate(required(text, VENCIMIENTO, "vencimiento")[1]),
      capital: amount(text, CAPITAL, "capital"),
      intereses: amount(text, INTERESES, "intereses"),
      iva: amount(text, IVA, "IVA"),
      seguros: amount(text, SEGUROS, "seguros"),
      totalPagado: amount(text, TOTAL_PAGADO, "total pagado"),
      totalUva,
    };
  },
};

export const totalsMatch = ({ capital, intereses, iva, seguros, totalPagado }: ParsedCouponImage): boolean =>
  toCents(capital) + toCents(intereses) + toCents(iva) + toCents(seguros) === toCents(totalPagado);
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `bunx vitest run server/src/parsers/icbcMortgageImage.test.ts && bun run typecheck`
Expected: PASS (10 tests) y typecheck sin errores.

- [ ] **Step 7: Commit** (sólo con autorización)

```bash
git branch --show-current
git status --short
git add shared/src/types.ts server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt server/src/parsers/icbcMortgageImage.ts server/src/parsers/icbcMortgageImage.test.ts
git commit -m "feat(server): parser de la captura del cupón del crédito" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- shared/src/types.ts server/src/parsers/__fixtures__/icbc-mortgage-image.sample.txt server/src/parsers/icbcMortgageImage.ts server/src/parsers/icbcMortgageImage.test.ts
```

---

### Task 3: Guardado de cupones compartido (refactor sin cambios de comportamiento)

**Files:**
- Create: `server/src/import/saveCoupon.ts`
- Modify: `server/src/import/importCoupon.ts` (archivo completo)
- Modify: `server/src/import/importPdf.ts` (`importMortgageCouponPdf`, líneas 64-71)
- Test: `server/src/import/importCoupon.test.ts`, `server/src/import/importPdf.test.ts` y `server/src/http/routes/import.test.ts`, sin cambios.

**Interfaces:**
- Consumes: `MortgageCouponModel`, `fetchOficialRate` (`server/src/fx/dollarRate.ts`) y `ParsedCoupon` (`@ledgerly/shared`).
- Produces:
  - `interface SaveCouponInput { coupon: ParsedCoupon; fileName: string; sourceHash: string; replace?: boolean }`.
  - `interface SaveCouponResult { status: "imported" | "duplicate"; couponId: string }`.
  - `saveCoupon(input: SaveCouponInput): Promise<SaveCouponResult>`, en `server/src/import/saveCoupon.ts`.
  - `mortgageCouponOutcome(saved: SaveCouponResult): Promise<ImportPdfOutcome>`, exportada desde `server/src/import/importPdf.ts`.
  - `ImportPdfInput` e `ImportPdfOutcome` siguen exportadas desde `importPdf.ts`, sin cambios.

- [ ] **Step 1: Correr la línea de base**

Run: `bunx vitest run server/src/import/importCoupon.test.ts server/src/import/importPdf.test.ts server/src/http/routes/import.test.ts`
Expected: PASS. Anotar la cantidad de tests: tiene que ser la misma al final.

- [ ] **Step 2: Extraer `saveCoupon`**

`server/src/import/saveCoupon.ts`:

```ts
import type { ParsedCoupon } from "@ledgerly/shared";
import { MortgageCouponModel } from "../db/models.js";
import { fetchOficialRate } from "../fx/dollarRate.js";

export interface SaveCouponInput {
  coupon: ParsedCoupon;
  fileName: string;
  sourceHash: string;
  replace?: boolean;
}

export interface SaveCouponResult {
  status: "imported" | "duplicate";
  couponId: string;
}

export async function saveCoupon({ coupon, fileName, sourceHash, replace = false }: SaveCouponInput): Promise<SaveCouponResult> {
  const existing = await MortgageCouponModel.findOne({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
  });
  if (existing && !replace) return { status: "duplicate", couponId: existing._id.toString() };
  if (existing && replace) await MortgageCouponModel.deleteOne({ _id: existing._id });

  const tipoCambioUsd = await fetchOficialRate(coupon.fechaDebito).catch(() => null);

  const created = await MortgageCouponModel.create({
    prestamoNro: coupon.prestamoNro,
    cuotaNro: coupon.cuotaNro,
    fechaDebito: new Date(coupon.fechaDebito),
    capital: coupon.capital,
    intereses: coupon.intereses,
    seguroIncendio: coupon.seguroIncendio,
    totalDebitado: coupon.totalDebitado,
    cuotaPuraUva: coupon.cuotaPuraUva,
    cotizacionUva: coupon.cotizacionUva,
    tea: coupon.tea,
    tna: coupon.tna,
    cft: coupon.cft,
    sourceFileName: fileName,
    sourceHash,
    tipoCambioUsd,
    tipoCambioSource: tipoCambioUsd != null ? "api" : null,
  });
  return { status: "imported", couponId: created._id.toString() };
}
```

- [ ] **Step 3: Reescribir `importCoupon` sobre `saveCoupon`**

`server/src/import/importCoupon.ts` (archivo completo):

```ts
import type { ExtractedPdf } from "@ledgerly/shared";
import { createHash } from "node:crypto";
import { parseCoupon } from "../ingestion/parseCoupon.js";
import { saveCoupon, type SaveCouponResult } from "./saveCoupon.js";

export async function importCoupon(input: {
  data: Uint8Array;
  fileName: string;
  replace?: boolean;
  extracted?: ExtractedPdf;
}): Promise<SaveCouponResult> {
  const sourceHash = createHash("sha256").update(input.data).digest("hex");
  const { coupon } = await parseCoupon(input.data, input.extracted);
  return saveCoupon({ coupon, fileName: input.fileName, sourceHash, replace: input.replace });
}
```

- [ ] **Step 4: Extraer el armado de la respuesta del cupón en `importPdf.ts`**

En `server/src/import/importPdf.ts`, reemplazar:

```ts
const importMortgageCouponPdf: KindImporter = async (input) => {
  const { status, couponId } = await importCoupon(input);
  const doc = found(await MortgageCouponModel.findById(couponId));
  return {
    result: { kind: "coupon", status, coupon: toMortgageCouponDTO(doc) },
    file: mortgageCouponToImportedFileDTO(doc),
  };
};
```

por:

```ts
export const mortgageCouponOutcome = async ({ status, couponId }: SaveCouponResult): Promise<ImportPdfOutcome> => {
  const doc = found(await MortgageCouponModel.findById(couponId));
  return {
    result: { kind: "coupon", status, coupon: toMortgageCouponDTO(doc) },
    file: mortgageCouponToImportedFileDTO(doc),
  };
};

const importMortgageCouponPdf: KindImporter = async (input) => mortgageCouponOutcome(await importCoupon(input));
```

Agregar el import junto a los otros de `./…`:

```ts
import type { SaveCouponResult } from "./saveCoupon.js";
```

- [ ] **Step 5: Correr los mismos tests y verificar que siguen pasando**

Run: `bunx vitest run server/src/import/importCoupon.test.ts server/src/import/importPdf.test.ts server/src/http/routes/import.test.ts && bun run typecheck`
Expected: PASS con la misma cantidad de tests que en el Step 1, y typecheck sin errores.

- [ ] **Step 6: Commit** (sólo con autorización)

```bash
git branch --show-current
git status --short
git add server/src/import/saveCoupon.ts server/src/import/importCoupon.ts server/src/import/importPdf.ts
git commit -m "refactor(server): guardado de cupones del crédito reutilizable" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/import/saveCoupon.ts server/src/import/importCoupon.ts server/src/import/importPdf.ts
```

---

### Task 4: Importar la captura como cupón

**Files:**
- Modify: `server/src/ingestion/errors.ts` (al final del archivo)
- Create: `server/src/import/importCouponImage.ts`
- Create: `server/src/import/importCouponImage.test.ts`

**Interfaces:**
- Consumes:
  - `recognizeImage(data, fileName): Promise<OcrObservation[]>` y `toLines(observations): string` (Task 1).
  - `icbcMortgageImageParser` y `totalsMatch` (Task 2).
  - `saveCoupon` y `mortgageCouponOutcome` (Task 3).
  - `ImportPdfInput { data: Uint8Array; fileName: string; replace?: boolean }` e `ImportPdfOutcome { result: ImportResultUnionDTO; file: ImportedFileDTO }`, de `importPdf.ts`.
- Produces:
  - `importCouponImage(input: ImportPdfInput): Promise<ImportPdfOutcome>`, en `server/src/import/importCouponImage.ts`.
  - `UnrecognizedCouponImageError`, `CouponImageTotalsError` y `MissingPreviousCouponError`, en `errors.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

`server/src/import/importCouponImage.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withDb } from "../testing/withDb.js";

vi.mock("../ocr/recognizeImage.js", () => ({ recognizeImage: vi.fn() }));
import { recognizeImage } from "../ocr/recognizeImage.js";
vi.mock("../fx/dollarRate.js", () => ({ fetchOficialRate: vi.fn() }));
import { fetchOficialRate } from "../fx/dollarRate.js";
import { MortgageCouponModel } from "../db/models.js";
import {
  CouponImageTotalsError, MissingPreviousCouponError, OcrFailedError, UnrecognizedCouponImageError,
} from "../ingestion/errors.js";
import { importCouponImage } from "./importCouponImage.js";

withDb();
const mockedOcr = vi.mocked(recognizeImage);
const mockedFx = vi.mocked(fetchOficialRate);

const fixture = readFileSync(
  fileURLToPath(new URL("../parsers/__fixtures__/icbc-mortgage-image.sample.txt", import.meta.url)),
  "utf8",
);
const observe = (text: string) =>
  text.trim().split("\n").map((line, index) => ({ text: line, x: 0.04, y: 0.1 * (index + 1), height: 0.03 }));
const withoutLine = (label: string): string =>
  fixture.split("\n").filter((line) => !line.startsWith(label)).join("\n");
const png = new Uint8Array([1, 2, 3]);

const PREVIOUS = {
  prestamoNro: "0000000001", capital: 1, intereses: 1, seguroIncendio: 1, totalDebitado: 3,
  cuotaPuraUva: 499.9, cotizacionUva: 2200, tea: 9.5, tna: 9.1, cft: 11.2,
  sourceFileName: "cupon-2.pdf", sourceHash: "hash-2",
};

beforeEach(async () => {
  mockedOcr.mockReset();
  mockedOcr.mockResolvedValue(observe(fixture));
  mockedFx.mockResolvedValue(1400);
  await MortgageCouponModel.create([
    { ...PREVIOUS, cuotaNro: 1, fechaDebito: new Date("2025-09-17"), tea: 1, tna: 1, cft: 1, sourceHash: "hash-1" },
    { ...PREVIOUS, cuotaNro: 2, fechaDebito: new Date("2025-10-17") },
  ]);
});

describe("importCouponImage", () => {
  it("guarda la captura como cupón con los datos del préstamo del cupón más reciente", async () => {
    const { result } = await importCouponImage({ data: png, fileName: "cuota-3.png" });
    expect(result).toMatchObject({ kind: "coupon", status: "imported" });
    const doc = await MortgageCouponModel.findOne({ cuotaNro: 3 }).lean();
    expect(doc).toMatchObject({
      prestamoNro: "0000000001", tea: 9.5, tna: 9.1, cft: 11.2,
      capital: 150000.1, intereses: 1000000.2, seguroIncendio: 10000.3, totalDebitado: 1160000.6,
      cuotaPuraUva: 499.9, cotizacionUva: 2300.46,
      sourceFileName: "cuota-3.png", tipoCambioUsd: 1400, tipoCambioSource: "api",
    });
    expect(doc?.fechaDebito.toISOString().slice(0, 10)).toBe("2025-11-17");
  });

  it("devuelve el archivo importado como un cupón del crédito", async () => {
    const { file } = await importCouponImage({ data: png, fileName: "cuota-3.png" });
    expect(file).toMatchObject({ kind: "coupon", fileName: "cuota-3.png", documentDate: "2025-11-17" });
  });

  it("reimportar la misma cuota devuelve duplicate sin crear otro cupón", async () => {
    await importCouponImage({ data: png, fileName: "cuota-3.png" });
    const { result } = await importCouponImage({ data: new Uint8Array([9]), fileName: "otra.png" });
    expect(result.status).toBe("duplicate");
    expect(await MortgageCouponModel.countDocuments({ cuotaNro: 3 })).toBe(1);
  });

  it("replace reemplaza la cuota ya importada y conserva el préstamo", async () => {
    await importCouponImage({ data: png, fileName: "cuota-3.png" });
    const corrected = fixture
      .replace("Seguros $ 10.000,30", "Seguros $ 10.000,40")
      .replace("Total pagado $1.160.000,60", "Total pagado $1.160.000,70");
    mockedOcr.mockResolvedValue(observe(corrected));
    const { result } = await importCouponImage({ data: new Uint8Array([9]), fileName: "corregida.png", replace: true });
    expect(result.status).toBe("imported");
    const docs = await MortgageCouponModel.find({ cuotaNro: 3 }).lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ seguroIncendio: 10000.4, prestamoNro: "0000000001", sourceFileName: "corregida.png" });
  });

  it("sin cupones previos falla con MissingPreviousCouponError y no guarda nada", async () => {
    await MortgageCouponModel.deleteMany({});
    await expect(importCouponImage({ data: png, fileName: "cuota-3.png" }))
      .rejects.toBeInstanceOf(MissingPreviousCouponError);
    expect(await MortgageCouponModel.countDocuments()).toBe(0);
  });

  it("si los montos no cierran falla con CouponImageTotalsError y no guarda nada", async () => {
    mockedOcr.mockResolvedValue(observe(fixture.replace("$ 10.000,30", "$ 10.000,80")));
    await expect(importCouponImage({ data: png, fileName: "cuota-3.png" }))
      .rejects.toBeInstanceOf(CouponImageTotalsError);
    expect(await MortgageCouponModel.countDocuments({ cuotaNro: 3 })).toBe(0);
  });

  it("una captura de otra cosa falla con UnrecognizedCouponImageError", async () => {
    mockedOcr.mockResolvedValue(observe("Mercado Pago\nTotal $ 1.000,00"));
    await expect(importCouponImage({ data: png, fileName: "otra.png" }))
      .rejects.toBeInstanceOf(UnrecognizedCouponImageError);
  });

  it("una imagen sin texto falla con UnrecognizedCouponImageError", async () => {
    mockedOcr.mockResolvedValue([]);
    await expect(importCouponImage({ data: png, fileName: "vacia.png" }))
      .rejects.toBeInstanceOf(UnrecognizedCouponImageError);
  });

  it("una captura del crédito incompleta falla con UnrecognizedCouponImageError", async () => {
    mockedOcr.mockResolvedValue(observe(withoutLine("Seguros")));
    await expect(importCouponImage({ data: png, fileName: "cortada.png" }))
      .rejects.toBeInstanceOf(UnrecognizedCouponImageError);
  });

  it("propaga el error del OCR", async () => {
    mockedOcr.mockRejectedValue(new OcrFailedError());
    await expect(importCouponImage({ data: png, fileName: "rota.png" })).rejects.toBeInstanceOf(OcrFailedError);
  });
});
```

`cotizacionUva` = round2((150000,10 + 1000000,20) / 499,90) = 2300,46.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `bunx vitest run server/src/import/importCouponImage.test.ts`
Expected: FAIL porque no se resuelven `./importCouponImage.js` ni los errores nuevos.

- [ ] **Step 3: Agregar los errores**

Al final de `server/src/ingestion/errors.ts`:

```ts
export class UnrecognizedCouponImageError extends IngestionError {
  constructor() {
    super("No se reconoció la captura del cupón");
    this.name = "UnrecognizedCouponImageError";
  }
}

export class CouponImageTotalsError extends IngestionError {
  constructor() {
    super("Los montos leídos no cierran con el total pagado");
    this.name = "CouponImageTotalsError";
  }
}

export class MissingPreviousCouponError extends IngestionError {
  constructor() {
    super("Importá primero un cupón PDF del préstamo");
    this.name = "MissingPreviousCouponError";
  }
}
```

- [ ] **Step 4: Implementar `importCouponImage`**

`server/src/import/importCouponImage.ts`:

```ts
import { createHash } from "node:crypto";
import type { ParsedCoupon, ParsedCouponImage } from "@ledgerly/shared";
import { MortgageCouponModel, type MortgageCouponDoc } from "../db/models.js";
import {
  CouponImageTotalsError, MissingPreviousCouponError, UnrecognizedCouponImageError,
} from "../ingestion/errors.js";
import { recognizeImage } from "../ocr/recognizeImage.js";
import { toLines } from "../ocr/toLines.js";
import { icbcMortgageImageParser, totalsMatch } from "../parsers/icbcMortgageImage.js";
import { mortgageCouponOutcome, type ImportPdfInput, type ImportPdfOutcome } from "./importPdf.js";
import { saveCoupon } from "./saveCoupon.js";

type LoanTerms = Pick<MortgageCouponDoc, "prestamoNro" | "tea" | "tna" | "cft">;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const readCoupon = (text: string): ParsedCouponImage => {
  if (!icbcMortgageImageParser.detect(text)) throw new UnrecognizedCouponImageError();
  try {
    return icbcMortgageImageParser.parse(text);
  } catch {
    throw new UnrecognizedCouponImageError();
  }
};

const latestLoanTerms = async (): Promise<LoanTerms> => {
  const latest = await MortgageCouponModel.findOne().sort({ fechaDebito: -1 });
  if (!latest) throw new MissingPreviousCouponError();
  const { prestamoNro, tea, tna, cft } = latest;
  return { prestamoNro, tea, tna, cft };
};

const toParsedCoupon = (image: ParsedCouponImage, terms: LoanTerms): ParsedCoupon => ({
  ...terms,
  cuotaNro: image.cuotaNro,
  fechaDebito: image.fechaDebito,
  capital: image.capital,
  intereses: image.intereses,
  seguroIncendio: image.seguros,
  totalDebitado: image.totalPagado,
  cuotaPuraUva: image.totalUva,
  cotizacionUva: round2((image.capital + image.intereses) / image.totalUva),
});

export async function importCouponImage({ data, fileName, replace = false }: ImportPdfInput): Promise<ImportPdfOutcome> {
  const image = readCoupon(toLines(await recognizeImage(data, fileName)));
  if (!totalsMatch(image)) throw new CouponImageTotalsError();
  const coupon = toParsedCoupon(image, await latestLoanTerms());
  const sourceHash = createHash("sha256").update(data).digest("hex");
  return mortgageCouponOutcome(await saveCoupon({ coupon, fileName, sourceHash, replace }));
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `bunx vitest run server/src/import/importCouponImage.test.ts && bun run typecheck`
Expected: PASS (10 tests) y typecheck sin errores.

- [ ] **Step 6: Commit** (sólo con autorización)

```bash
git branch --show-current
git status --short
git add server/src/ingestion/errors.ts server/src/import/importCouponImage.ts server/src/import/importCouponImage.test.ts
git commit -m "feat(server): importar la captura del cupón del crédito" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/ingestion/errors.ts server/src/import/importCouponImage.ts server/src/import/importCouponImage.test.ts
```

---

### Task 5: La ruta de importación acepta imágenes

**Files:**
- Modify: `server/src/http/routes/import.ts` (archivo completo)
- Modify: `server/src/http/routes/import.test.ts` (imports al principio + un `describe` nuevo al final)

**Interfaces:**
- Consumes:
  - `importCouponImage(input: ImportPdfInput): Promise<ImportPdfOutcome>` (Task 4).
  - `importPdf` y `MAX_PDF_BYTES` de `importPdf.ts`.
  - Fixture `icbc-mortgage-image.sample.txt` (Task 2).
- Produces: `POST /api/import`, que acepta PDF o imagen. `MAX_UPLOAD_BYTES` sigue exportado.

- [ ] **Step 1: Escribir los tests que fallan**

En `server/src/http/routes/import.test.ts`, agregar debajo de la línea `import { extractPdfText } from "../../pdf/extract.js";`:

```ts
vi.mock("../../ocr/recognizeImage.js", () => ({ recognizeImage: vi.fn() }));
import { recognizeImage } from "../../ocr/recognizeImage.js";
import { MortgageCouponModel } from "../../db/models.js";
```

Debajo de `const autoText = read("../../parsers/__fixtures__/auto-plan.sample.txt");`:

```ts
const mockedOcr = vi.mocked(recognizeImage);
const imageObservations = read("../../parsers/__fixtures__/icbc-mortgage-image.sample.txt")
  .trim()
  .split("\n")
  .map((text, index) => ({ text, x: 0.04, y: 0.1 * (index + 1), height: 0.03 }));
const UNSUPPORTED_FILE = "Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)";

const seedPreviousCoupon = () =>
  MortgageCouponModel.create({
    prestamoNro: "0000000001", cuotaNro: 2, fechaDebito: new Date("2025-10-17"), capital: 1, intereses: 1,
    seguroIncendio: 1, totalDebitado: 3, cuotaPuraUva: 499.9, cotizacionUva: 2200, tea: 9.5, tna: 9.1, cft: 11.2,
    sourceFileName: "cupon-2.pdf", sourceHash: "hash-2",
  });
```

Y al final del archivo:

```ts
describe("POST /api/import (captura del crédito)", () => {
  beforeEach(() => {
    mockedOcr.mockReset();
    mockedOcr.mockResolvedValue(imageObservations);
  });

  it("importa un PNG como cupón del crédito (kind coupon, 201)", async () => {
    await seedPreviousCoupon();
    const res = await request(app)
      .post("/api/import")
      .attach("file", Buffer.from("png"), { filename: "cuota-3.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("coupon");
    expect(res.body.coupon.cuotaNro).toBe(3);
  });

  it("acepta una captura HEIC del iPhone aunque llegue como octet-stream", async () => {
    await seedPreviousCoupon();
    const res = await request(app)
      .post("/api/import")
      .attach("file", Buffer.from("heic"), { filename: "IMG_0001.HEIC", contentType: "application/octet-stream" });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("coupon");
  });

  it("lee la imagen con OCR y no con el extractor de PDF", async () => {
    await seedPreviousCoupon();
    mocked.mockClear();
    await request(app)
      .post("/api/import")
      .attach("file", Buffer.from("png"), { filename: "cuota-3.png", contentType: "image/png" });
    expect(mocked).not.toHaveBeenCalled();
    expect(mockedOcr).toHaveBeenCalledTimes(1);
  });

  it("sin cupón previo responde 422 con el mensaje", async () => {
    const res = await request(app)
      .post("/api/import")
      .attach("file", Buffer.from("png"), { filename: "cuota-3.png", contentType: "image/png" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Importá primero un cupón PDF del préstamo");
  });

  it("una imagen que no es la captura del crédito responde 422", async () => {
    await seedPreviousCoupon();
    mockedOcr.mockResolvedValue([{ text: "Mercado Pago", x: 0.04, y: 0.1, height: 0.03 }]);
    const res = await request(app)
      .post("/api/import")
      .attach("file", Buffer.from("png"), { filename: "otra.png", contentType: "image/png" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("No se reconoció la captura del cupón");
  });

  it("rechaza un tipo no soportado nombrando PDF e imágenes", async () => {
    const res = await request(app)
      .post("/api/import")
      .attach("file", Buffer.from("x"), { filename: "notas.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(UNSUPPORTED_FILE);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `bunx vitest run server/src/http/routes/import.test.ts`
Expected: FAIL. Los casos con imagen dan 400 («Sólo se aceptan archivos PDF») y el último no coincide con el mensaje nuevo. Los tests anteriores siguen pasando.

- [ ] **Step 3: Implementar la ruta**

`server/src/http/routes/import.ts` (archivo completo):

```ts
import { Router, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { HttpError, asyncHandler } from "../errors.js";
import { importPdf, MAX_PDF_BYTES } from "../../import/importPdf.js";
import { importCouponImage } from "../../import/importCouponImage.js";
import { IngestionError } from "../../ingestion/errors.js";

export const MAX_UPLOAD_BYTES = MAX_PDF_BYTES;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/heic"]);
const IMAGE_EXTENSION = /\.(png|jpe?g|heic)$/i;
const UNSUPPORTED_FILE = "Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)";

const isPdf = (file: Express.Multer.File): boolean =>
  file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);

const isImage = (file: Express.Multer.File): boolean =>
  IMAGE_TYPES.has(file.mimetype) || IMAGE_EXTENSION.test(file.originalname);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isPdf(file) && !isImage(file)) {
      cb(new HttpError(400, UNSUPPORTED_FILE));
      return;
    }
    cb(null, true);
  },
});

const uploadFile = (req: Request, res: Response, next: NextFunction): void => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(413, `El archivo supera el máximo de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`));
        return;
      }
      next(new HttpError(400, "Subida inválida"));
      return;
    }
    next(err);
  });
};

export const importRouter = Router();

importRouter.post("/", uploadFile, asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Falta el archivo (campo 'file')");
  const importFile = isPdf(req.file) ? importPdf : importCouponImage;
  try {
    const { result } = await importFile({
      data: req.file.buffer,
      fileName: req.file.originalname,
      replace: req.query.replace === "true",
    });
    res.status(result.status === "duplicate" ? 200 : 201).json(result);
  } catch (err) {
    if (err instanceof IngestionError) throw new HttpError(422, err.message);
    throw err;
  }
}));
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `bunx vitest run server/src/http/routes/import.test.ts && bun run typecheck`
Expected: PASS con todos los tests del archivo, viejos y nuevos. El test viejo «rechaza un archivo que no es PDF → 400» sigue pasando porque el mensaje nuevo también matchea `/pdf/i`.

- [ ] **Step 5: Commit** (sólo con autorización)

```bash
git branch --show-current
git status --short
git add server/src/http/routes/import.ts server/src/http/routes/import.test.ts
git commit -m "feat(server): Importar acepta la captura del crédito" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/http/routes/import.ts server/src/http/routes/import.test.ts
```

---

### Task 6: El dropzone acepta imágenes

**Files:**
- Modify: `client/src/components/FileDropzone.tsx` (archivo completo)
- Modify: `client/src/components/FileDropzone.test.tsx` (archivo completo)
- Modify: `client/src/pages/ImportPage.test.tsx:214-217`

**Interfaces:**
- Consumes: nada nuevo. `useImportFile` ya manda cualquier `File` por `FormData`.
- Produces: `FileDropzone` con la misma firma (`{ onFile, disabled }`). Acepta PDF, PNG, JPEG y HEIC.

> El working tree ya tiene un cambio sin commitear del usuario en `FileDropzone.tsx`: le sacó la «o» final al texto «Arrastrá el PDF del resumen o». La línea nueva lo reemplaza y respeta ese criterio (sin «o»). Antes de commitear, `git diff client/src/components/FileDropzone.tsx` tiene que mostrar sólo los cambios de esta tarea más ese.

- [ ] **Step 1: Reescribir los tests del dropzone (fallan)**

`client/src/components/FileDropzone.test.tsx` (archivo completo):

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { FileDropzone } from "./FileDropzone.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REJECTED = /sólo se aceptan pdf o imágenes/i;
const dropzone = () => screen.getByText(/arrastrá el pdf o la captura del crédito/i).parentElement!;
const drop = (file: File) => fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pdf = () => new File(["x"], "resumen.pdf", { type: "application/pdf" });
const png = () => new File(["x"], "cuota.png", { type: "image/png" });
const heicWithoutType = () => new File(["x"], "IMG_0001.HEIC", { type: "" });
const txt = () => new File(["x"], "notas.txt", { type: "text/plain" });

describe("FileDropzone", () => {
  it("acepta un PDF soltado", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("acepta una captura PNG soltada", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(png());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("cuota.png");
  });

  it("acepta una captura HEIC aunque el navegador no informe el tipo", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(heicWithoutType());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("ignora un archivo que no es PDF ni imagen", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(txt());
    expect(onFile).not.toHaveBeenCalled();
  });

  it("avisa al usuario cuando el archivo soltado no es PDF ni imagen", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    drop(txt());
    expect(screen.getByText(REJECTED)).toBeInTheDocument();
  });

  it("limpia el aviso cuando después se suelta un archivo válido", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(txt());
    drop(png());
    expect(screen.queryByText(REJECTED)).not.toBeInTheDocument();
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("sigue aceptando PDFs elegidos por el input", async () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    await userEvent.upload(fileInput(), pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("el selector de archivos ofrece PDF e imágenes", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    expect(fileInput().accept).toBe("application/pdf,image/png,image/jpeg,image/heic");
  });
});

describe("FileDropzone en mobile", () => {
  beforeEach(() => emulateMobile());

  it("no habla de arrastrar y ofrece «Elegir archivo»", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    expect(screen.queryByText(/arrastrá/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elegir PDF" })).not.toBeInTheDocument();
  });

  it("«Elegir archivo» abre el selector de archivos", async () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    const opened = vi.fn();
    fileInput().addEventListener("click", opened);
    await userEvent.click(screen.getByRole("button", { name: "Elegir archivo" }));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("acepta la captura elegida y avisa si lo elegido no es PDF ni imagen", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    await user.upload(fileInput(), txt());
    expect(screen.getByText(REJECTED)).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    await user.upload(fileInput(), png());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(REJECTED)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ajustar el test de mobile de `ImportPage`**

En `client/src/pages/ImportPage.test.tsx`, reemplazar:

```tsx
  it("ofrece «Elegir PDF» y lista los archivos importados como tarjetas, sin grilla", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByRole("button", { name: "Elegir PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/arrastrá el pdf/i)).not.toBeInTheDocument();
```

por:

```tsx
  it("ofrece «Elegir archivo» y lista los archivos importados como tarjetas, sin grilla", async () => {
    renderWithProviders(<ImportPage />);
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toBeInTheDocument();
    expect(screen.queryByText(/arrastrá/i)).not.toBeInTheDocument();
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `bunx vitest run client/src/components/FileDropzone.test.tsx client/src/pages/ImportPage.test.tsx`
Expected: FAIL en los casos de PNG/HEIC, el aviso, el `accept`, «Elegir archivo» en mobile y el texto «Arrastrá el PDF o la captura del crédito».

- [ ] **Step 4: Implementar el dropzone**

`client/src/components/FileDropzone.tsx` (archivo completo):

```tsx
import { useRef, useState, type DragEvent } from "react";
import { Box, Button, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useIsMobile } from "../useIsMobile.js";

interface FileDropzoneProps { onFile: (file: File) => void; disabled?: boolean; }

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/heic"];
const ACCEPTED_EXTENSIONS = /\.(pdf|png|jpe?g|heic)$/i;

const isAccepted = (file: File): boolean =>
  ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.test(file.name);

export const FileDropzone = ({ onFile, disabled = false }: FileDropzoneProps) => {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);

  const handleFile = (file: File) => {
    if (!isAccepted(file)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      sx={{
        border: "2px dashed", borderColor: dragging ? "primary.main" : "divider",
        borderRadius: 2, p: { xs: 3, md: 5 }, textAlign: "center", mb: 3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <UploadFileIcon fontSize="large" color="action" />
      {!isMobile && <Typography sx={{ my: 1 }}>Arrastrá el PDF o la captura del crédito</Typography>}
      <Button
        variant="contained"
        disabled={disabled}
        fullWidth={isMobile}
        onClick={() => inputRef.current?.click()}
        sx={{ mt: { xs: 1, md: 0 } }}
      >
        Elegir archivo
      </Button>
      {rejected && (
        <Typography color="error" variant="body2" sx={{ mt: 2 }}>
          Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)
        </Typography>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </Box>
  );
};
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `bunx vitest run client/src/components/FileDropzone.test.tsx client/src/pages/ImportPage.test.tsx && bun run typecheck`
Expected: PASS y typecheck sin errores.

- [ ] **Step 6: Commit** (sólo con autorización)

```bash
git branch --show-current
git status --short
git diff client/src/components/FileDropzone.tsx
git add client/src/components/FileDropzone.tsx client/src/components/FileDropzone.test.tsx client/src/pages/ImportPage.test.tsx
git commit -m "feat(client): Importar acepta la captura del crédito" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- client/src/components/FileDropzone.tsx client/src/components/FileDropzone.test.tsx client/src/pages/ImportPage.test.tsx
```

---

### Task 7: Prueba con la captura real y verificación final

**Files:**
- Create: `server/src/import/couponImage.real.test.ts`
- Local, no se commitea: `examples/credito/imagenes/2026-09-cuota-14.png`

**Interfaces:**
- Consumes: `recognizeImage` y `toLines` (Task 1), `icbcMortgageImageParser` y `totalsMatch` (Task 2).
- Produces: un test que corre el OCR real sólo en macOS y sólo si hay capturas en `examples/credito/imagenes/`.

- [ ] **Step 1: Copiar la captura real a `examples/` (gitignoreado)**

```bash
mkdir -p examples/credito/imagenes
cp "/Users/sebastianopderbeck/Downloads/Pasted 2026-10-06 at 4.36.13 PM.png" examples/credito/imagenes/2026-09-cuota-14.png
git check-ignore -q examples/credito/imagenes/2026-09-cuota-14.png && echo ignorado
```

Expected: imprime `ignorado`.

- [ ] **Step 2: Escribir el test con la captura real**

`server/src/import/couponImage.real.test.ts`. Las lecturas van en `beforeAll`, según la convención del repo para `examples/`. Lo único que corre a nivel de módulo es el listado del directorio, protegido con `existsSync`.

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedCouponImage } from "@ledgerly/shared";
import { recognizeImage } from "../ocr/recognizeImage.js";
import { toLines } from "../ocr/toLines.js";
import { icbcMortgageImageParser, totalsMatch } from "../parsers/icbcMortgageImage.js";

const dir = fileURLToPath(new URL("../../../examples/credito/imagenes/", import.meta.url));
const images = existsSync(dir) ? readdirSync(dir).filter((name) => /\.(png|jpe?g|heic)$/i.test(name)) : [];
const canRun = process.platform === "darwin" && images.length > 0;

describe.skipIf(!canRun)("capturas reales del crédito", () => {
  const parsed: ParsedCouponImage[] = [];

  beforeAll(async () => {
    for (const name of images) {
      const observations = await recognizeImage(readFileSync(join(dir, name)), name);
      parsed.push(icbcMortgageImageParser.parse(toLines(observations)));
    }
  }, 120_000);

  it("lee cada captura completa y sus montos cierran con el total pagado", () => {
    expect(parsed).toHaveLength(images.length);
    for (const coupon of parsed) {
      expect(coupon.cuotaNro).toBeGreaterThan(0);
      expect(coupon.fechaDebito).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(totalsMatch(coupon)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Correr el test real**

Run: `bunx vitest run server/src/import/couponImage.real.test.ts`
Expected: PASS (1 test). La primera corrida de Vision puede tardar ~30 s.

- [ ] **Step 4: Verificar que el guard saltea sin la carpeta**

Se renombra sólo la carpeta propia, no `examples/` entero, que otras sesiones usan:

```bash
mv examples/credito/imagenes examples/credito/.imagenes-ocultas && bunx vitest run server/src/import/couponImage.real.test.ts; mv examples/credito/.imagenes-ocultas examples/credito/imagenes
```

Expected: el archivo reporta 1 test salteado y ningún fallo.

- [ ] **Step 5: Suite completa y typecheck**

Run: `bun run test && bun run typecheck`
Expected: todo en verde. Si falla algún test ajeno a esta rama, reportarlo con la salida y no tocarlo.

- [ ] **Step 6: Commit del test** (sólo con autorización)

```bash
git branch --show-current
git status --short
git add server/src/import/couponImage.real.test.ts
git commit -m "test(server): la captura real del crédito se lee y cierra" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- server/src/import/couponImage.real.test.ts
```

- [ ] **Step 7: Prueba por HTTP contra la base real (preguntar antes)**

Esto escribe en la base real, la misma que usa el servicio instalado: importa la cuota 14. **Preguntarle al usuario antes de correrlo.** Si dice que no, saltear este paso y reportarlo.

```bash
lsof -iTCP:4300 -sTCP:LISTEN
PORT=4300 node --env-file=.env --import tsx server/src/index.ts &
SERVER_PID=$!
curl -s -F "file=@examples/credito/imagenes/2026-09-cuota-14.png;type=image/png" localhost:4300/api/import
curl -s -F "file=@examples/credito/imagenes/2026-09-cuota-14.png;type=image/png" localhost:4300/api/import
kill $SERVER_PID
```

Expected:
- El primer `curl` responde `"kind":"coupon"`, `"status":"imported"` y `cuotaNro` 14.
- El segundo responde `"status":"duplicate"`.
- La cuota 14 aparece en Créditos con la cotización calculada.

- [ ] **Step 8: Riesgo pendiente después del merge**

El servicio instalado toma `origin/main` por auto-deploy. Después del merge, importar la próxima captura desde la app publicada. Eso confirma que `osascript` + Vision anda desde el LaunchAgent. Si falla con «No se pudo leer el texto de la imagen», revisar el log del servicio.
