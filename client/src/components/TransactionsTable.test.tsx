import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { TransactionsTable } from "./TransactionsTable.js";

const rows: TransactionDTO[] = [
  { id: "1", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
    descriptionRaw: "MERCADOLIBRE", merchant: "MERCADOLIBRE", category: "Compras", categorySource: "rule",
    amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: "1" },
  { id: "2", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-06-08",
    descriptionRaw: "SU PAGO", merchant: "SU PAGO", category: "Sin categoría", categorySource: "rule",
    amount: 5000, currency: "ARS", direction: "credit", type: "payment", isInstallment: false,
    installmentCurrent: null, installmentTotal: null, comprobante: null },
  { id: "3", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-06-10",
    descriptionRaw: "NOTEBOOK", merchant: "NOTEBOOK", category: "Tecnología", categorySource: "rule",
    amount: 45000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
    installmentCurrent: 3, installmentTotal: 12, comprobante: "3" },
];

afterEach(cleanup);

const setup = () => {
  const onDelete = vi.fn();
  renderWithProviders(<TransactionsTable rows={rows} onCategoryChange={() => undefined} onDelete={onDelete} />);
  return onDelete;
};

describe("TransactionsTable borrado", () => {
  it("el ícono de fila + confirmar llama onDelete con ese id", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: /borrar MERCADOLIBRE/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1"]);
  });

  it("cancelar no llama onDelete", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: /borrar SU PAGO/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("selección múltiple + borrar seleccionados + confirmar llama onDelete con los ids", async () => {
    const onDelete = setup();
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: /borrar seleccionados \(1\)/i }));
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1"]);
  });
});

describe("TransactionsTable columna Cuota", () => {
  it("muestra la fracción de cuota en los movimientos en cuotas", () => {
    setup();
    expect(screen.getByText("3/12")).toBeInTheDocument();
  });

  it("no muestra fracción en un movimiento que no es cuota", () => {
    setup();
    expect(screen.queryByText("1/1")).not.toBeInTheDocument();
  });
});
