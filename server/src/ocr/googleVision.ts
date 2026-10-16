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
