import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";

vi.mock("./syncMail.js", () => ({ runMailSync: vi.fn(), findLastMailRun: vi.fn() }));
import { findLastMailRun, runMailSync } from "./syncMail.js";
vi.mock("./notifyRun.js", () => ({ notifyRun: vi.fn() }));
import { notifyRun } from "./notifyRun.js";
import type { MailSourceSetup } from "./mailSourceSetup.js";
import { formatMailRunLog, startMailJob } from "./mailJob.js";
import { MAIL_STARTUP_DELAY_MS, MAX_TIMER_MS, type MailSchedule } from "./mailSchedule.js";

const HOUR = 3_600_000;
const SCHEDULE: MailSchedule = { fromDay: 25, toDay: 5, hour: 21 };
const NOW = new Date(2026, 9, 27, 10);
const hoursBefore = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
const SLOT_DELAY = 11 * HOUR;

const openClient = vi.fn();

const setup = (schedule: MailSchedule | null, overrides: Partial<MailSourceSetup> = {}): MailSourceSetup => ({
  source: "gmail", missing: [], scope: "has:attachment", schedule, openClient, ...overrides,
});

const item = (id: string, outcome: MailSyncItemDTO["outcome"]): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: "2026-09-28T12:00:00.000Z", outcome, kind: null, documentId: null, detail: "x",
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "gmail", trigger: "job", startedAt: new Date(2026, 9, 26, 21).toISOString(), finishedAt: new Date(2026, 9, 26, 21).toISOString(), status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
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

  it("corre en el próximo slot, loguea y encadena el del día siguiente", async () => {
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY - 1);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    expect(runMailSync).toHaveBeenCalledWith("gmail", openClient, "job");
    expect(console.log).toHaveBeenCalledWith(formatMailRunLog(runOf()));
    await vi.advanceTimersByTimeAsync(24 * HOUR - 1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("después de la corrida del 5 salta al 25", async () => {
    vi.setSystemTime(new Date(2026, 10, 5, 10));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(11 * HOUR);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(19 * 24 * HOUR + 23 * HOUR);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(new Date(Date.now())).toEqual(new Date(2026, 10, 25, 21));
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("se pone al día si la última corrida quedó vieja", async () => {
    vi.mocked(findLastMailRun).mockResolvedValue(runOf({ startedAt: new Date(2026, 9, 3, 21).toISOString() }));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(MAIL_STARTUP_DELAY_MS - 1);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("respeta la última corrida registrada", async () => {
    vi.mocked(findLastMailRun).mockResolvedValue(runOf({ startedAt: hoursBefore(13).toISOString() }));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY - 1);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("loguea con console.error una corrida que terminó en error", async () => {
    vi.mocked(runMailSync).mockResolvedValue(runOf({ status: "error", error: "Gmail respondió 403." }));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Gmail respondió 403.");
    stop();
  });

  it("sigue programando aunque una corrida rechace", async () => {
    vi.mocked(runMailSync).mockRejectedValueOnce(new Error("Mongo caído"));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(console.error).toHaveBeenCalledWith("Gmail (automática): error — Mongo caído");
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("una notificación colgada no frena la próxima corrida", async () => {
    vi.mocked(notifyRun).mockReturnValue(new Promise<void>(() => {}));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(runMailSync).toHaveBeenCalledTimes(2);
    stop();
  });

  it("si no puede leer la última corrida espera el próximo slot", async () => {
    vi.mocked(findLastMailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("la función devuelta cancela la próxima corrida", async () => {
    const stop = await startMailJob(setup(SCHEDULE));
    stop();
    await vi.advanceTimersByTimeAsync(SLOT_DELAY + 48 * HOUR);
    expect(runMailSync).not.toHaveBeenCalled();
  });

  it("sin agenda no programa nada", async () => {
    await startMailJob(setup(null));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY + 48 * HOUR);
    expect(runMailSync).not.toHaveBeenCalled();
    expect(findLastMailRun).not.toHaveBeenCalled();
  });

  it("una fuente sin configurar no programa nada", async () => {
    await startMailJob(setup(SCHEDULE, { openClient: null, missing: ["GMAIL_REFRESH_TOKEN"] }));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY + 48 * HOUR);
    expect(runMailSync).not.toHaveBeenCalled();
    expect(findLastMailRun).not.toHaveBeenCalled();
  });

  it("mira la última corrida de su propia fuente y corre esa fuente", async () => {
    const stop = await startMailJob(setup(SCHEDULE, { source: "icloud" }));
    expect(findLastMailRun).toHaveBeenCalledWith("icloud");
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(runMailSync).toHaveBeenCalledWith("icloud", openClient, "job");
    stop();
  });

  it("después de cada corrida automática avisa con la corrida y la anterior de su fuente", async () => {
    const previous = runOf({ startedAt: hoursBefore(13).toISOString(), status: "error", error: "x" });
    const run = runOf({ status: "error", error: "x" });
    vi.mocked(findLastMailRun).mockResolvedValue(previous);
    vi.mocked(runMailSync).mockResolvedValue(run);
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(notifyRun).toHaveBeenCalledWith(run, previous);
    stop();
  });

  it("si no puede leer la corrida anterior avisa igual, sin anterior", async () => {
    vi.mocked(findLastMailRun).mockRejectedValue(new Error("Mongo caído"));
    const stop = await startMailJob(setup(SCHEDULE));
    await vi.advanceTimersByTimeAsync(SLOT_DELAY);
    expect(notifyRun).toHaveBeenCalledWith(runOf(), null);
    stop();
  });

  it("con una ventana de huecos largos no arma timers por encima del tope y corre una sola vez en el slot", async () => {
    vi.setSystemTime(new Date(2026, 10, 3, 22));
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const stop = await startMailJob(setup({ fromDay: 1, toDay: 3, hour: 21 }));
    const slot = new Date(2026, 11, 1, 21);
    await vi.advanceTimersByTimeAsync(slot.getTime() - Date.now() - 1);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    expect(new Date(Date.now())).toEqual(slot);
    const delays = timeoutSpy.mock.calls.map(([, delay]) => delay ?? 0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_TIMER_MS);
    await vi.advanceTimersByTimeAsync(23 * HOUR);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it("un timer que dispara unos ms antes del slot corre una sola vez", async () => {
    const callbacks: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number) => {
      callbacks.push(callback);
      return realSetTimeout(callback, delay);
    }) as typeof setTimeout);
    const stop = await startMailJob(setup(SCHEDULE));
    const slot = new Date(2026, 9, 27, 21);
    vi.setSystemTime(new Date(slot.getTime() - 5));
    callbacks[0]();
    await vi.advanceTimersByTimeAsync(4);
    expect(runMailSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MAIL_STARTUP_DELAY_MS);
    expect(runMailSync).toHaveBeenCalledTimes(1);
    stop();
  });
});
