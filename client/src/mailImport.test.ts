import { describe, it, expect } from "vitest";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";
import { formatLocalDate } from "./format.js";
import {
  formatDateTime, mailIntervalLabel, mailItemSecondary, gmailLastRunLabel, gmailMissingVarsMessage, mailRunSummary,
  joinWithY, splitMailItems,
} from "./mailImport.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const SHORT_DATE_TIME = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

const item = (id: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null, detail: "Formato de resumen no reconocido",
  ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z", status: "ok", error: null,
  messagesChecked: 0, hasMore: false, items: [], ...overrides,
});

describe("joinWithY", () => {
  it("une con comas y una «y» final", () => {
    expect(joinWithY([])).toBe("");
    expect(joinWithY(["A"])).toBe("A");
    expect(joinWithY(["A", "B"])).toBe("A y B");
    expect(joinWithY(["A", "B", "C"])).toBe("A, B y C");
  });
});

describe("gmailMissingVarsMessage", () => {
  it("nombra las variables que faltan", () => {
    expect(gmailMissingVarsMessage(["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"])).toBe(
      "Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN en el .env del server. Los pasos para obtenerlas están en el README, sección «Importar desde Gmail»; después reiniciá el server.",
    );
  });

  it("concuerda en singular cuando falta una sola", () => {
    expect(gmailMissingVarsMessage(["GMAIL_REFRESH_TOKEN"])).toBe(
      "Falta GMAIL_REFRESH_TOKEN en el .env del server. Los pasos para obtenerla están en el README, sección «Importar desde Gmail»; después reiniciá el server.",
    );
  });
});

describe("mailIntervalLabel", () => {
  it("apagada, en horas si es múltiplo de 60, si no en minutos", () => {
    expect(mailIntervalLabel(null)).toBe("apagada");
    expect(mailIntervalLabel(360)).toBe("cada 6 h");
    expect(mailIntervalLabel(60)).toBe("cada 1 h");
    expect(mailIntervalLabel(90)).toBe("cada 90 min");
  });
});

describe("gmailLastRunLabel y formatDateTime", () => {
  it("sin corridas invita a buscar", () => {
    expect(gmailLastRunLabel(null)).toBe("Todavía no buscaste en Gmail.");
  });

  it("muestra la fecha corta y quién la disparó", () => {
    const expected = SHORT_DATE_TIME.format(new Date("2026-10-03T17:05:00.000Z"));
    expect(formatDateTime("2026-10-03T17:05:00.000Z")).toBe(expected);
    expect(gmailLastRunLabel(runOf())).toBe(`Última búsqueda: ${expected} (manual)`);
    expect(gmailLastRunLabel(runOf({ trigger: "job" }))).toBe(`Última búsqueda: ${expected} (automática)`);
  });
});

describe("mailRunSummary", () => {
  it("una corrida con error y sin ítems no tiene resumen", () => {
    expect(mailRunSummary(runOf({ status: "error", error: "Gmail respondió 500." }))).toBeNull();
  });

  it("sin mails nuevos lo dice", () => {
    expect(mailRunSummary(runOf())).toBe("No había mails nuevos.");
  });

  it("cuenta solo lo distinto de cero, en singular", () => {
    const run = runOf({ messagesChecked: 3, items: [item("a", "imported"), item("b", "duplicate"), item("c", "skipped")] });
    expect(mailRunSummary(run)).toBe("Revisé 3 mails nuevos: 1 importado · 1 ya estaba · 1 omitido");
  });

  it("usa los plurales", () => {
    const run = runOf({
      messagesChecked: 8,
      items: [
        item("a", "imported"), item("b", "imported"), item("c", "duplicate"), item("d", "duplicate"),
        item("e", "skipped"), item("f", "skipped"), item("g", "failed"), item("h", "failed"),
      ],
    });
    expect(mailRunSummary(run)).toBe("Revisé 8 mails nuevos: 2 importados · 2 ya estaban · 2 omitidos · 2 con error");
  });

  it("con un mail y un error lo cuenta", () => {
    expect(mailRunSummary(runOf({ messagesChecked: 1, items: [item("a", "failed")] })))
      .toBe("Revisé 1 mail nuevo: 1 con error");
  });

  it("con mails pero sin ítems dice que no tenían PDFs", () => {
    expect(mailRunSummary(runOf({ messagesChecked: 1 }))).toBe("Revisé 1 mail nuevo: no tenía PDFs.");
    expect(mailRunSummary(runOf({ messagesChecked: 2 }))).toBe("Revisé 2 mails nuevos: no tenían PDFs.");
  });

  it("una corrida con error que alcanzó a procesar algo también tiene resumen", () => {
    expect(mailRunSummary(runOf({ status: "error", error: "x", messagesChecked: 1, items: [item("a", "imported")] })))
      .toBe("Revisé 1 mail nuevo: 1 importado");
  });
});

describe("splitMailItems", () => {
  it("separa los omitidos y ordena importados, con error y ya estaban", () => {
    const items = [item("dup", "duplicate"), item("omit", "skipped"), item("err", "failed"), item("imp", "imported")];
    const { visible, skipped } = splitMailItems(items);
    expect(visible.map(({ id }) => id)).toEqual(["imp", "err", "dup"]);
    expect(skipped.map(({ id }) => id)).toEqual(["omit"]);
  });
});

describe("mailItemSecondary", () => {
  it("une tipo, detalle y fecha de recepción", () => {
    const imported = item("a", "imported", { kind: "statement", detail: "Visa Signature ****1234 · 42 movimientos" });
    expect(mailItemSecondary(imported)).toBe(`Tarjeta · Visa Signature ****1234 · 42 movimientos · ${formatLocalDate(RECEIVED_AT)}`);
  });

  it("sin tipo deja solo el detalle y la fecha", () => {
    expect(mailItemSecondary(item("b", "skipped"))).toBe(`Formato de resumen no reconocido · ${formatLocalDate(RECEIVED_AT)}`);
  });
});
