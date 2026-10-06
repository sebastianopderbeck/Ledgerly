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
    execFile("osascript", ["-l", "JavaScript", scriptPath, imagePath], { timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
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
  } catch (err) {
    console.error(`OCR (Vision): ${err instanceof Error ? err.message : String(err)}`);
    throw new OcrFailedError();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
