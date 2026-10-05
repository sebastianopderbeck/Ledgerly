import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";

vi.mock("./syncMail.js", () => ({ runMailSync: vi.fn(), findLastMailRun: vi.fn() }));
import { findLastMailRun, runMailSync } from "./syncMail.js";
vi.mock("./notifyRun.js", () => ({ notifyRun: vi.fn() }));
import { notifyRun } from "./notifyRun.js";
import type { MailSourceSetup } from "./mailSourceSetup.js";
import { formatMailRunLog, MAIL_STARTUP_DELAY_MS, nextMailRunDelayMs, startMailJob } from "./mailJob.js";

const MINUTE = 60_000;
const NOW = new Date("2026-10-03T12:00:00.000Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);

const openClient = vi.fn();

const setup = (intervalMinutes: number | null, overrides: Partial<MailSourceSetup> = {}): MailSourceSetup => ({
  source: "gmail", missing: [], scope: "has:attachment", intervalMinutes, openClient, ...overrides,
});

const item = (id: string, outcome: MailSyncItemDTO["outcome"]): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: "2026-09-28T12:00:00.000Z", outcome, kind: null, documentId: null, detail: "x",
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "gmail", trigger: "job", startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

describe("nextMailRunDelayMs", () => {
  it("sin corridas espera el delay de arranque", () => {
    expect(nextMailRunDelayMs(null, 360, NOW)).toBe(MAIL_STARTUP_DELAY_MS);
  });

  it("con una corrida reciente espera lo que falta del intervalo", () => {
    expect(nextMailRunDelayMs(minutesBefore(60), 360, NOW)).toBe(300 * MINUTE);
  });

  it("con una corrida vieja usa el piso de 60 s", () => {
    expect(nextMailRunDelayMs(minutesBefore(3 * 24 * 60), 360, NOW)).toBe(MAIL_STARTUP_DELAY_MS);
  });

  it("nunca baja del piso aunque falten segundos", () => {
    const delay = nextMailRunDelayMs(new Date(NOW.getTime() - (360 * MINUTE - 30_000)), 360, NOW);
    expect(delay).toBe(MAIL_STARTUP_DELAY_MS);
    expect(delay).toBeGreaterThan(0);
  });
});

describe("formatMailRunLog", () => {
  it("usa el nombre de la fuente", () => {
    expect(formatMailRunLog(runOf({ source: "icloud", status: "error", error: "x" }))).toBe("iCloud (automática): error — x");
  });

  it("resume una corrida automática ok", () => {
    const run = runOf({ messagesChecked: 2, items: [item("a", "imported"), item("b", "skipped")] });
    expect(formatMailRunLog(run)).toBe(
      "Gmail (automática): 2 mails nuevos · importados 1 · ya estaban 0 · omitidos 1 · con error 0",
    );
  });

  it("usa el singular con un solo mail", () => {
    expect(formatMailRunLog(runOf({ messagesChecked: 1, items: [item("a", "duplicate")] })))
      .toBe("Gmail (automática): 1 mail nuevo · importados 0 · ya estaban 1 · omitidos 0 · con error 0");
  });

  it("muestra el error de una corrida fallida", () => {
    expect(formatMailRunLog(runOf({ status: "error", error: "Gmail respondió 500." })))
      .toBe("Gmail (automática): error — Gmail respondió 500.");
  });

  it("dice manual si la corrida a la que se unió el job era manual", () => {
    expect(formatMailRunLog(runOf({ trigger: "manual" }))).toMatch(/^Gmail \(manual\): /);
  });
});

describe("startMailJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(runMailSync).mockReset();
    vi.mocked(findLastMailRun).mockReset();
    vi.mocked(findLastMailRun).mockResolvedValue(null);
    vi.mocked(runMailSync).mockResolvedValue(runOf());
    vi.mocked(notifyRun).mockReset();
    vi.mocked(notifyRun).mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("corre al delay de arranque, loguea y encadena la siguiente al intervalo", async () => {
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS - 1);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    expect(runMailSync).toHaveBeenCalledWith("gmail", openClient, "job");
    expect(console.log).toHaveBeenCalledWith(formatMailRunLog(runOf()));
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("respeta la última corrida registrada", async () => {
    vi.mocked(findLastMailRun).mockResolvedValue(runOf({ startedAt: minutesBefore(60).toISOString() }));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(300 * MINUTE - 1);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("loguea con console.error una corrida que terminó en error", async () => {
    vi.mocked(runMailSync).mockResolvedValue(runOf({ status: "error", error: "Gmail respondió 403." }));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Gmail respondió 403.");
    stop();
  });

  it("sigue programando aunque una corrida rechace", async () => {
    vi.mocked(runMailSync).mockRejectedValueOnce(new Error("Mongo caído"));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Mongo caído");
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("una notificación colgada no frena la próxima corrida", async () => {
    vi.mocked(notifyRun).mockReturnValue(new Promise<void>(() => {}));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(360 * MINUTE);
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("si no puede leer la última corrida arranca con el delay de arranque", async () => {
    vi.mocked(findLastMailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("la función devuelta cancela la próxima corrida", async () => {
    const stop = await startMailJob(setup(360));
    stop();
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("sin intervalo no programa nada", async () => {
    await startMailJob(setup(null));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runMailSync).not.toHaveBeenCalled();
    expect(findLastMailRun).not.toHaveBeenCalled();
  });

  it("una fuente sin configurar no programa nada", async () => {
    await startMailJob(setup(360, { openClient: null, missing: ["GMAIL_REFRESH_TOKEN"] }));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS + 720 * MINUTE);
    expect(runMailSync).not.toHaveBeenCalled();
    expect(findLastMailRun).not.toHaveBeenCalled();
  });

  it("mira la última corrida de su propia fuente y corre esa fuente", async () => {
    const stop = await startMailJob(setup(360, { source: "icloud" }));
    expect(findLastMailRun).toHaveBeenCalledWith("icloud");
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(runMailSync).toHaveBeenCalledWith("icloud", openClient, "job");
    stop();
  });

  it("después de cada corrida automática avisa con la corrida y la anterior de su fuente", async () => {
    const previous = runOf({ startedAt: minutesBefore(400).toISOString(), status: "error", error: "x" });
    const run = runOf({ status: "error", error: "x" });
    vi.mocked(findLastMailRun).mockResolvedValue(previous);
    vi.mocked(runMailSync).mockResolvedValue(run);
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(notifyRun).toHaveBeenCalledWith(run, previous);
    stop();
  });

  it("si no puede leer la corrida anterior avisa igual, sin anterior", async () => {
    vi.mocked(findLastMailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startMailJob(setup(360));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS);
    expect(notifyRun).toHaveBeenCalledWith(runOf(), null);
    stop();
  });
});
