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
