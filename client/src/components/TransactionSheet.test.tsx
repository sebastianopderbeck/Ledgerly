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

const musicapp: TransactionDTO = {
  ...notebook, id: "4", descriptionRaw: "MUSICAPP 7731", merchant: "MUSICAPP 7731", category: "Entretenimiento",
  amount: 5490, isInstallment: false, installmentCurrent: null, installmentTotal: null, comprobante: "4",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(["Compras", "Salud", "Tecnología"]), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setup = (transaction: TransactionDTO = notebook) => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const onMarkSubscription = vi.fn();
  renderWithProviders(
    <TransactionSheet
      transaction={transaction}
      open
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      onMarkSubscription={onMarkSubscription}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: transaction.merchant });
  return {
    onSave, onDelete, onClose, onMarkSubscription, sheet,
    category: within(sheet).getByRole("combobox", { name: "Categoría" }),
  };
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

  it("un consumo en cuotas no ofrece marcarlo como suscripción", () => {
    const { sheet } = setup();
    expect(within(sheet).queryByRole("button", { name: "Es una suscripción" })).not.toBeInTheDocument();
  });

  it("«Es una suscripción» manda el comercio y cierra la hoja", async () => {
    const { sheet, onMarkSubscription, onClose, onSave } = setup(musicapp);
    await userEvent.click(within(sheet).getByRole("button", { name: "Es una suscripción" }));
    expect(onMarkSubscription).toHaveBeenCalledWith("MUSICAPP 7731");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
