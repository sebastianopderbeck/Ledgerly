import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReviewFinding, StatementDTO, StatementReviewDTO, TransactionDTO } from "@ledgerly/shared";
import { formatMoney } from "../format.js";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { StatementReviewChecklist } from "./StatementReviewChecklist.js";

afterEach(cleanup);

const money = (amount: number, currency: "ARS" | "USD"): string => formatMoney(amount, currency).replace(/\s/g, " ");

const STATEMENT: StatementDTO = {
  id: "s1",
  issuer: "visa_signature",
  cardLabel: "Visa Signature ****1234",
  last4: "1234",
  closingDate: "2026-09-25",
  dueDate: "2026-10-06",
  totals: {
    totalConsumos: { ars: 0, usd: 0 },
    saldoActual: { ars: 1234567.89, usd: 45 },
    pagoMinimo: { ars: 0, usd: 0 },
    saldoAnterior: { ars: 0, usd: 0 },
  },
  sourceFileName: "visa.pdf",
  needsReview: false,
  reconciliation: { ok: true, entries: [] },
  transactionCount: 40,
  uploadedAt: "2026-09-26T12:00:00.000Z",
};

const transaction = (id: string, merchant: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id, statementId: "s1", issuer: "visa_signature", cardLabel: "Visa Signature ****1234", date: "2026-09-12",
  descriptionRaw: merchant, merchant, category: "Comida", categorySource: "rule", amount: 2500, currency: "ARS",
  direction: "debit", type: "purchase", isInstallment: false, installmentCurrent: null, installmentTotal: null,
  comprobante: null, ...overrides,
});

const DUPLICATE: ReviewFinding = {
  kind: "transaction",
  key: "tx:t31",
  transaction: transaction("t31", "COMERCIO UNO"),
  reasons: ["duplicado"],
  duplicateOf: { transactionId: "t30", date: "2026-09-11", sameStatement: true },
  usualUsd: null,
};

const UNUSUAL_USD: ReviewFinding = {
  kind: "transaction",
  key: "tx:t35",
  transaction: transaction("t35", "SERVICIO EXTERIOR", { date: "2026-09-03", amount: 14.99, currency: "USD", category: "Suscripciones" }),
  reasons: ["usd"],
  duplicateOf: null,
  usualUsd: 10.99,
};

const NEW_UNCATEGORIZED: ReviewFinding = {
  kind: "transaction",
  key: "tx:t40",
  transaction: transaction("t40", "COMERCIO NUEVO", { date: "2026-09-15", amount: 8000, category: "Sin categoría" }),
  reasons: ["nuevo", "sin-categoria"],
  duplicateOf: null,
  usualUsd: null,
};

const CATEGORY_SPIKE: ReviewFinding = {
  kind: "category", key: "cat:Supermercado", category: "Supermercado", total: 450000, average: 250000, ratio: 1.8,
};

const FINDINGS = [DUPLICATE, UNUSUAL_USD, NEW_UNCATEGORIZED, CATEGORY_SPIKE];

const reviewWith = (overrides: Partial<StatementReviewDTO> = {}): StatementReviewDTO => ({
  statement: STATEMENT,
  previousStatements: 9,
  historyStatements: 6,
  skippedChecks: [],
  findings: FINDINGS,
  reviewedKeys: ["tx:t35"],
  ...overrides,
});

const setup = (review: StatementReviewDTO = reviewWith()) => {
  const onMark = vi.fn();
  renderWithProviders(<StatementReviewChecklist review={review} onMark={onMark} />);
  return { onMark };
};

const rowOf = (title: string): HTMLElement =>
  screen.getByRole("checkbox", { name: `revisado: ${title}` }).closest("li") as HTMLElement;

describe("StatementReviewChecklist", () => {
  it("muestra el resumen, el progreso y contra qué se comparó", () => {
    setup();
    expect(screen.getByText("Visa Signature ****1234")).toBeInTheDocument();
    expect(screen.getByText(
      `Cierre 2026-09-25 · Vence 2026-10-06 · Saldo ${money(1234567.89, "ARS")} + ${money(45, "USD")}`,
    )).toBeInTheDocument();
    expect(screen.getByText("1 de 4 revisados")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "progreso de la revisión" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Comparado con los 6 resúmenes anteriores de esta tarjeta.")).toBeInTheDocument();
  });

  it("resume cada chequeo en un chip", () => {
    setup();
    for (const label of ["Duplicados: 1", "USD inusuales: 1", "Comercios nuevos: 1", "Categorías en alza: 1", "Sin categoría: 1"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("muestra cada hallazgo con sus motivos y su porqué", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Movimientos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Categorías por encima de su promedio" })).toBeInTheDocument();
    const duplicate = rowOf("COMERCIO UNO");
    expect(within(duplicate).getByText("¿Duplicado?")).toBeInTheDocument();
    expect(within(duplicate).getByText("Comida")).toBeInTheDocument();
    expect(within(duplicate).getByText("2026-09-12")).toBeInTheDocument();
    expect(within(duplicate).getByText(money(2500, "ARS"))).toBeInTheDocument();
    expect(within(duplicate).getByText("Mismo comercio y monto que el cargo del 2026-09-11.")).toBeInTheDocument();
    const usd = rowOf("SERVICIO EXTERIOR");
    expect(within(usd).getByText("USD inusual")).toBeInTheDocument();
    expect(within(usd).getByText(money(14.99, "USD"))).toBeInTheDocument();
    expect(within(usd).getByText(`Hasta ahora, como mucho ${money(10.99, "USD")} (+36,4%).`)).toBeInTheDocument();
    const fresh = rowOf("COMERCIO NUEVO");
    expect(within(fresh).getByText("Comercio nuevo")).toBeInTheDocument();
    expect(within(fresh).getAllByText("Sin categoría")).toHaveLength(1);
    const category = rowOf("Supermercado");
    expect(within(category).getByText(money(450000, "ARS"))).toBeInTheDocument();
    expect(within(category).getByText(`Promedio de los últimos 6 resúmenes: ${money(250000, "ARS")}`)).toBeInTheDocument();
    expect(within(category).getByText("+80,0%")).toBeInTheDocument();
  });

  it("los tildados quedan marcados y no cambian de lugar", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: "revisado: SERVICIO EXTERIOR" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "revisado: COMERCIO UNO" })).not.toBeChecked();
    expect(screen.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
      "revisado: COMERCIO UNO", "revisado: SERVICIO EXTERIOR", "revisado: COMERCIO NUEVO", "revisado: Supermercado",
    ]);
  });

  it("tocar una fila la tilda, y tocar una tildada la destilda", async () => {
    const { onMark } = setup();
    await userEvent.click(screen.getByText("COMERCIO UNO"));
    expect(onMark).toHaveBeenLastCalledWith(["tx:t31"], true);
    await userEvent.click(screen.getByRole("checkbox", { name: "revisado: SERVICIO EXTERIOR" }));
    expect(onMark).toHaveBeenLastCalledWith(["tx:t35"], false);
    await userEvent.click(screen.getByText("Supermercado"));
    expect(onMark).toHaveBeenLastCalledWith(["cat:Supermercado"], true);
    expect(onMark).toHaveBeenCalledTimes(3);
  });

  it("«Marcar todo como revisado» manda solo las pendientes", async () => {
    const { onMark } = setup(reviewWith({ reviewedKeys: ["tx:t35", "tx:vieja"] }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar todo como revisado" }));
    expect(onMark).toHaveBeenCalledWith(["tx:t31", "tx:t40", "cat:Supermercado"], true);
  });

  it("con todo revisado muestra «Revisado» y no ofrece marcar todo", () => {
    setup(reviewWith({ reviewedKeys: ["tx:t31", "tx:t35", "tx:t40", "cat:Supermercado"] }));
    expect(screen.getByText("Revisado")).toBeInTheDocument();
    expect(screen.getByText("4 de 4 revisados")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar todo como revisado" })).not.toBeInTheDocument();
  });

  it("sin hallazgos lo dice, sin progreso ni acciones", () => {
    setup(reviewWith({ findings: [], reviewedKeys: [] }));
    expect(screen.getByText("No encontramos nada raro en este resumen.")).toBeInTheDocument();
    expect(screen.getByText("Duplicados: 0")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Revisado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar todo como revisado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Movimientos" })).not.toBeInTheDocument();
  });

  it("los chequeos que necesitan historia se muestran sin historial en el primer resumen", () => {
    setup(reviewWith({
      previousStatements: 0,
      historyStatements: 0,
      skippedChecks: ["usd", "nuevo", "categoria"],
      findings: [DUPLICATE],
      reviewedKeys: [],
    }));
    expect(screen.getByText("Comercios nuevos: sin historial")).toBeInTheDocument();
    expect(screen.getByText("USD inusuales: sin historial")).toBeInTheDocument();
    expect(screen.getByText("Es el primer resumen de esta tarjeta: solo se buscan duplicados y movimientos sin categoría."))
      .toBeInTheDocument();
  });

  it("avisa si el resumen no reconcilia", () => {
    setup(reviewWith({
      statement: {
        ...STATEMENT,
        needsReview: true,
        reconciliation: { ok: false, entries: [{ currency: "ARS", expected: 100, parsed: 90, diff: 10, ok: false }] },
      },
    }));
    expect(screen.getByText("La reconciliación no cuadra")).toBeInTheDocument();
  });

  it("ofrece ir a Reglas solo si hay movimientos sin categoría", () => {
    setup();
    expect(screen.getByRole("link", { name: "Categorizar en Reglas" })).toHaveAttribute("href", "/rules");
    cleanup();
    setup(reviewWith({ findings: [DUPLICATE, UNUSUAL_USD] }));
    expect(screen.queryByRole("link", { name: "Categorizar en Reglas" })).not.toBeInTheDocument();
  });
});
