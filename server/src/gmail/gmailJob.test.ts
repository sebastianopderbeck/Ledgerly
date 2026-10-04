import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";

vi.mock("./syncGmail.js", () => ({ runGmailSync: vi.fn(), findLastGmailRun: vi.fn() }));
import { findLastGmailRun, runGmailSync } from "./syncGmail.js";
import type { GmailConfig } from "./gmailConfig.js";
import { formatGmailRunLog, GMAIL_STARTUP_DELAY_MS, nextGmailRunDelayMs, startGmailJob } from "./gmailJob.js";

const MINUTE = 60_000;
const NOW = new Date("2026-10-03T12:00:00.000Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);

const config = (intervalMinutes: number | null): GmailConfig => ({
  credentials: { clientId: "id-sintetico", clientSecret: "secreto-sintetico", refreshToken: "refresh-sintetico" },
  query: "has:attachment",
  intervalMinutes,
});

const item = (id: string, outcome: GmailSyncItemDTO["outcome"]): GmailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: "2026-09-28T12:00:00.000Z", outcome, kind: null, documentId: null, detail: "x",
});

const runOf = (overrides: Partial<GmailSyncRunDTO> = {}): GmailSyncRunDTO => ({
  trigger: "job", startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

describe("nextGmailRunDelayMs", () => {
  it("sin corridas espera el delay de arranque", () => {
    expect(nextGmailRunDelayMs(null, 360, NOW)).toBe(GMAIL_STARTUP_DELAY_MS);
  });

  it("con una corrida reciente espera lo que falta del intervalo", () => {
    expect(nextGmailRunDelayMs(minutesBefore(60), 360, NOW)).toBe(300 * MINUTE);
  });

  it("con una corrida vieja usa el piso de 60 s", () => {
    expect(nextGmailRunDelayMs(minutesBefore(3 * 24 * 60), 360, NOW)).toBe(GMAIL_STARTUP_DELAY_MS);
  });

  it("nunca baja del piso aunque falten segundos", () => {
    const delay = nextGmailRunDelayMs(new Date(NOW.getTime() - (360 * MINUTE - 30_000)), 360, NOW);
    expect(delay).toBe(GMAIL_STARTUP_DELAY_MS);
    expect(delay).toBeGreaterThan(0);
  });
});

describe("formatGmailRunLog", () => {
  it("resume una corrida automática ok", () => {
    const run = runOf({ messagesChecked: 2, items: [item("a", "imported"), item("b", "skipped")] });
    expect(formatGmailRunLog(run)).toBe(
      "Gmail (automática): 2 mails nuevos · importados 1 · ya estaban 0 · omitidos 1 · con error 0",
    );
  });

  it("usa el singular con un solo mail", () => {
    expect(formatGmailRunLog(runOf({ messagesChecked: 1, items: [item("a", "duplicate")] })))
      .toBe("Gmail (automática): 1 mail nuevo · importados 0 · ya estaban 1 · omitidos 0 · con error 0");
  });

  it("muestra el error de una corrida fallida", () => {
    expect(formatGmailRunLog(runOf({ status: "error", error: "Gmail respondió 500." })))
      .toBe("Gmail (automática): error — Gmail respondió 500.");
  });

  it("dice manual si la corrida a la que se unió el job era manual", () => {
    expect(formatGmailRunLog(runOf({ trigger: "manual" }))).toMatch(/^Gmail \(manual\): /);
  });
});

describe("startGmailJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(runGmailSync).mockReset();
    vi.mocked(findLastGmailRun).mockReset();
    vi.mocked(findLastGmailRun).mockResolvedValue(null);
    vi.mocked(runGmailSync).mockResolvedValue(runOf());
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("corre al delay de arranque, loguea y encadena la siguiente al intervalo", async () => {
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS - 1);
    expect(runGmailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runGmailSync).toHaveBeenCalledTimes(1);
    expect(runGmailSync).toHaveBeenCalledWith(config(360), "job");
    expect(console.log).toHaveBeenCalledWith(formatGmailRunLog(runOf()));
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runGmailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("respeta la última corrida registrada", async () => {
    vi.mocked(findLastGmailRun).mockResolvedValue(runOf({ startedAt: minutesBefore(60).toISOString() }));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(300 * MINUTE - 1);
    expect(runGmailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runGmailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("loguea con console.error una corrida que terminó en error", async () => {
    vi.mocked(runGmailSync).mockResolvedValue(runOf({ status: "error", error: "Gmail respondió 403." }));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Gmail respondió 403.");
    stop();
  });

  it("sigue programando aunque una corrida rechace", async () => {
    vi.mocked(runGmailSync).mockRejectedValueOnce(new Error("Mongo caído"));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Mongo caído");
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runGmailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("si no puede leer la última corrida arranca con el delay de arranque", async () => {
    vi.mocked(findLastGmailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startGmailJob(config(360));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS);
    expect(runGmailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("la función devuelta cancela la próxima corrida", async () => {
    const stop = await startGmailJob(config(360));
    stop();
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runGmailSync).not.toHaveBeenCalled();
  });

  it("sin intervalo no programa nada", async () => {
    await startGmailJob(config(null));
    await vi.advanceTimersByTimeAsync(GMAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runGmailSync).not.toHaveBeenCalled();
    expect(findLastGmailRun).not.toHaveBeenCalled();
  });
});
