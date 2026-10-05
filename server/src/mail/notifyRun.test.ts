import { describe, it, expect, vi, afterEach } from "vitest";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((
    _file: string, _args: string[], _options: object, callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    callback(null, { stdout: "", stderr: "" });
  }),
}));
import { execFile } from "node:child_process";
import { notifyRun, osascriptNotify, runNotifications } from "./notifyRun.js";

const item = (fileName: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id: fileName, fileName, receivedAt: "2026-09-30T13:00:00.000Z", outcome, kind: null, documentId: null, detail: "detalle",
  ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "icloud", trigger: "job", startedAt: "2026-10-05T12:00:00.000Z", finishedAt: "2026-10-05T12:00:09.000Z",
  status: "ok", error: null, messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

const AUTH_ERROR = "iCloud rechazó el usuario o la contraseña de app.";

describe("runNotifications", () => {
  it("un importado se anuncia con su detalle", () => {
    const run = runOf({ items: [item("Resumen6oct2026.pdf", "imported", { kind: "statement", detail: "ICBC · 64 movimientos" })] });
    expect(runNotifications(run, null)).toEqual(["Importé Resumen6oct2026.pdf: ICBC · 64 movimientos"]);
  });

  it("varios importados van en un solo aviso", () => {
    const run = runOf({ items: [item("a.pdf", "imported"), item("b.pdf", "imported"), item("c.pdf", "imported")] });
    expect(runNotifications(run, null)).toEqual(["Importé 3 documentos: a.pdf, b.pdf y c.pdf"]);
  });

  it("avisa los fallidos y los documentos reconocidos que no se pudieron leer, no los ajenos ni los repetidos", () => {
    const run = runOf({
      items: [
        item("roto.pdf", "failed", { detail: "Mongo se cayó" }),
        item("Resumen6oct2026.pdf", "skipped", { kind: "statement", detail: "No se encontraron movimientos en el resumen" }),
        item("factura.pdf", "skipped", { detail: "Formato de resumen no reconocido" }),
        item("viejo.pdf", "duplicate"),
      ],
    });
    expect(runNotifications(run, null)).toEqual([
      "No pude importar roto.pdf: Mongo se cayó",
      "Resumen6oct2026.pdf parece un resumen pero no lo pude leer: No se encontraron movimientos en el resumen",
    ]);
  });

  it("un fallido que vuelve a fallar igual en la corrida siguiente no se vuelve a avisar", () => {
    const run = runOf({ items: [item("roto.pdf", "failed", { detail: "Mongo se cayó" })] });
    const same = runOf({ items: [item("roto.pdf", "failed", { detail: "Mongo se cayó" })] });
    const otherDetail = runOf({ items: [item("roto.pdf", "failed", { detail: "Otro motivo" })] });
    expect(runNotifications(run, same)).toEqual([]);
    expect(runNotifications(run, otherDetail)).toEqual(["No pude importar roto.pdf: Mongo se cayó"]);
  });

  it("una corrida con error avisa solo si la anterior de la fuente no había fallado", () => {
    const failed = runOf({ status: "error", error: AUTH_ERROR });
    expect(runNotifications(failed, null)).toEqual([AUTH_ERROR]);
    expect(runNotifications(failed, runOf())).toEqual([AUTH_ERROR]);
    expect(runNotifications(failed, runOf({ status: "error", error: AUTH_ERROR }))).toEqual([]);
  });

  it("sin novedades, o en una corrida manual, no avisa nada", () => {
    expect(runNotifications(runOf({ items: [item("viejo.pdf", "duplicate")] }), null)).toEqual([]);
    expect(runNotifications(runOf({ trigger: "manual", items: [item("a.pdf", "imported")] }), null)).toEqual([]);
    expect(runNotifications(runOf({ trigger: "manual", status: "error", error: AUTH_ERROR }), null)).toEqual([]);
  });
});

describe("notifyRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("manda cada aviso con el título de la fuente", async () => {
    const notify = vi.fn(async (): Promise<void> => undefined);
    await notifyRun(runOf({ items: [item("a.pdf", "imported", { detail: "ICBC" })] }), null, { notify, platform: "darwin" });
    expect(notify).toHaveBeenCalledWith("Ledgerly · iCloud", "Importé a.pdf: ICBC");
  });

  it("fuera de macOS no hace nada", async () => {
    const notify = vi.fn(async (): Promise<void> => undefined);
    await notifyRun(runOf({ items: [item("a.pdf", "imported")] }), null, { notify, platform: "linux" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("si una notificación falla lo loguea y sigue con la próxima", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const notify = vi.fn(async (): Promise<void> => {
      throw new Error("osascript no está");
    });
    const run = runOf({ items: [item("a.pdf", "imported"), item("b.pdf", "failed")] });
    await expect(notifyRun(run, null, { notify, platform: "darwin" })).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledWith("Ledgerly · iCloud: no pude mostrar la notificación — osascript no está");
  });
});

describe("osascriptNotify", () => {
  it("pasa título y texto como argumentos, sin meterlos en el AppleScript", async () => {
    await osascriptNotify("Ledgerly · Gmail", 'Importé "raro" & cía.pdf: x');
    expect(execFile).toHaveBeenCalledWith(
      "osascript",
      [
        "-e", "on run argv", "-e", "display notification (item 2 of argv) with title (item 1 of argv)", "-e", "end run",
        "Ledgerly · Gmail", 'Importé "raro" & cía.pdf: x',
      ],
      { timeout: 10_000 },
      expect.any(Function),
    );
  });
});
