import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { TransactionSheet } from "./TransactionSheet.js";

const notebook: TransactionDTO = {
  id: "3", statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-06-10",
  descriptionRaw: "NOTEBOOK", merchant: "NOTEBOOK", category: "Tecnología", categorySource: "rule",
  amount: 45000, currency: "ARS", direction: "debit", type: "purchase", isInstallment: true,
  installmentCurrent: 3, installmentTotal: 12, comprobante: "3",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(["Compras", "Salud", "Tecnología"]), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setup = () => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(<TransactionSheet transaction={notebook} open onClose={onClose} onSave={onSave} onDelete={onDelete} />);
  const sheet = screen.getByRole("dialog", { name: "NOTEBOOK" });
  return { onSave, onDelete, onClose, sheet, category: within(sheet).getByRole("combobox", { name: "Categoría" }) };
};

describe("TransactionSheet", () => {
  it("muestra fecha, tipo, monto, cuota y la categoría actual", () => {
    const { sheet, category } = setup();
    expect(within(sheet).getByText("2026-06-10")).toBeInTheDocument();
    expect(within(sheet).getByText("purchase")).toBeInTheDocument();
    expect(within(sheet).getByText("3/12")).toBeInTheDocument();
    expect(category).toHaveValue("Tecnología");
  });

  it("sin cambiar la categoría no deja guardar", () => {
    const { sheet } = setup();
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("guarda una categoría nueva escrita a mano", async () => {
    const { sheet, category, onSave, onClose } = setup();
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith("3", "Viajes");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deja elegir una categoría existente de la lista", async () => {
    const { sheet, category, onSave } = setup();
    await userEvent.clear(category);
    await userEvent.type(category, "Sal");
    await userEvent.click(await screen.findByRole("option", { name: "Salud" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith("3", "Salud");
  });

  it("Borrar pide borrar el movimiento y no guarda nada", async () => {
    const { sheet, onSave, onDelete } = setup();
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(notebook);
    expect(onSave).not.toHaveBeenCalled();
  });
});
