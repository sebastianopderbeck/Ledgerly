import { describe, it, expect } from "vitest";
import type { MailSyncItemDTO, MailSyncRunDTO } from "@ledgerly/shared";
import { formatLocalDate } from "./format.js";
import {
  formatDateTime, joinWithY, mailDisabledTitle, mailHasMoreMessage, mailItemSecondary, mailLastRunLabel,
  mailMissingMessage, mailRunSummary, mailScopeLabel, mailSearchLabel, splitMailItems,
} from "./mailImport.js";

const RECEIVED_AT = "2026-09-28T12:00:00.000Z";
const SHORT_DATE_TIME = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

const item = (id: string, outcome: MailSyncItemDTO["outcome"], overrides: Partial<MailSyncItemDTO> = {}): MailSyncItemDTO => ({
  id, fileName: `${id}.pdf`, receivedAt: RECEIVED_AT, outcome, kind: null, documentId: null, detail: "Formato de resumen no reconocido",
  ...overrides,
});

const runOf = (overrides: Partial<MailSyncRunDTO> = {}): MailSyncRunDTO => ({
  source: "gmail", trigger: "manual", startedAt: "2026-10-03T17:05:00.000Z", finishedAt: "2026-10-03T17:05:09.000Z", status: "ok", error: null,
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

describe("mailMissingMessage", () => {
  it("nombra lo que falta y la sección del README de la fuente", () => {
    expect(mailMissingMessage("gmail", ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"])).toBe(
      "Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN. Los pasos están en el README, sección «Importar desde Gmail»; después reiniciá el server.",
    );
  });

  it("concuerda en singular cuando falta una sola cosa", () => {
    expect(mailMissingMessage("icloud", ["la contraseña de app en el Llavero"])).toBe(
      "Falta la contraseña de app en el Llavero. Los pasos están en el README, sección «Importar desde iCloud»; después reiniciá el server.",
    );
  });
});

describe("mailLastRunLabel y formatDateTime", () => {
  it("sin corridas invita a buscar en la fuente", () => {
    expect(mailLastRunLabel("gmail", null)).toBe("Todavía no buscaste en Gmail.");
    expect(mailLastRunLabel("icloud", null)).toBe("Todavía no buscaste en iCloud.");
  });

  it("muestra la fecha corta y quién la disparó", () => {
    const expected = SHORT_DATE_TIME.format(new Date("2026-10-03T17:05:00.000Z"));
    expect(formatDateTime("2026-10-03T17:05:00.000Z")).toBe(expected);
    expect(mailLastRunLabel("gmail", runOf())).toBe(`Última búsqueda: ${expected} (manual)`);
    expect(mailLastRunLabel("icloud", runOf({ trigger: "job" }))).toBe(`Última búsqueda: ${expected} (automática)`);
  });
});

describe("textos por fuente", () => {
  it("botón, título deshabilitado, alcance y aviso de pendientes", () => {
    expect(mailSearchLabel("icloud")).toBe("Buscar en iCloud");
    expect(mailSearchLabel("gmail")).toBe("Buscar en Gmail");
    expect(mailDisabledTitle("gmail")).toBe("Importación desde Gmail deshabilitada");
    expect(mailScopeLabel("gmail", "has:attachment")).toBe("Consulta: has:attachment");
    expect(mailScopeLabel("icloud", "INBOX · desde el 01/09/2026")).toBe("Revisa: INBOX · desde el 01/09/2026");
    expect(mailHasMoreMessage("icloud")).toBe("Quedan mails por revisar: tocá «Buscar en iCloud» otra vez.");
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

  it("un documento reconocido que no se pudo leer queda a la vista, después de los errores", () => {
    const items = [
      item("dup", "duplicate"), item("roto", "skipped", { kind: "statement" }), item("err", "failed"), item("omit", "skipped"),
    ];
    const { visible, skipped } = splitMailItems(items);
    expect(visible.map(({ id }) => id)).toEqual(["err", "roto", "dup"]);
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
