import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { OcrFailedError, OcrUnavailableError } from "../ingestion/errors.js";
import { recognizeImage, type OcrObservation, type RecognizeImageDeps } from "./recognizeImage.js";

const OBSERVATIONS: OcrObservation[] = [{ text: "Capital", x: 0.04, y: 0.38, height: 0.03 }];

const darwin = (runScript: RecognizeImageDeps["runScript"]): RecognizeImageDeps => ({ platform: "darwin", runScript });

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("recognizeImage, registro de fallas", () => {
  it("deja en el log el motivo por el que falló el OCR", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runScript = vi.fn(async (_script: string, _imagePath: string): Promise<string> => {
      throw new Error("Vision sin permiso");
    });
    await expect(recognizeImage(new Uint8Array([1]), "a.png", darwin(runScript))).rejects.toBeInstanceOf(OcrFailedError);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("Vision sin permiso"));
  });

  it.skipIf(process.platform !== "darwin")("en macOS el log incluye el error real de osascript", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recognizeImage(new TextEncoder().encode("no soy una imagen"), "falsa.png"))
      .rejects.toBeInstanceOf(OcrFailedError);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("Vision no pudo procesar la imagen"));
  }, 60_000);
});
