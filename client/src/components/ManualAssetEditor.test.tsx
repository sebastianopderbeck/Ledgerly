import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManualAssetDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { ManualAssetEditor } from "./ManualAssetEditor.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TODAY = "2026-10-03";

const ahorros: ManualAssetDTO = {
  id: "a-ahorros", nombre: "Ahorros", tipo: "ahorro", moneda: "USD",
  valuaciones: [{ fecha: "2026-08-01", monto: 4000 }, { fecha: "2026-10-01", monto: 5000 }],
};

interface SetupOptions {
  asset?: ManualAssetDTO | null;
  error?: string | null;
}

const setup = ({ asset = null, error = null }: SetupOptions = {}) => {
  const handlers = { onClose: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onDeleteValuation: vi.fn() };
  renderWithProviders(
    <ManualAssetEditor open asset={asset} today={TODAY} error={error} saving={false} {...handlers} />,
  );
  const sheet = screen.getByRole("dialog", { name: asset ? "Editar activo" : "Nuevo activo" });
  return { ...handlers, sheet };
};

describe("ManualAssetEditor para un activo nuevo", () => {
  it("Guardar se habilita con nombre y valor válidos y manda el alta", async () => {
    const { sheet, onSave } = setup();
    const save = within(sheet).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Caja de ahorro");
    expect(save).toBeDisabled();
    const value = within(sheet).getByRole("textbox", { name: "Valor en pesos" });
    await userEvent.type(value, "abc");
    expect(save).toBeDisabled();
    await userEvent.clear(value);
    await userEvent.type(value, "1.500,50");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({
      kind: "create",
      body: { nombre: "Caja de ahorro", tipo: "cuenta", moneda: "ARS", valuacion: { fecha: TODAY, monto: 1500.5 } },
    });
  });

  it("elegir Dólares cambia la moneda y la etiqueta del valor", async () => {
    const { sheet } = setup();
    await userEvent.click(within(sheet).getByRole("button", { name: "Dólares" }));
    expect(within(sheet).getByRole("button", { name: "Dólares" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("textbox", { name: "Valor en dólares" })).toBeInTheDocument();
  });

  it("la fecha arranca en hoy y no deja elegir días futuros", () => {
    const { sheet } = setup();
    const fecha = within(sheet).getByLabelText("Fecha de valuación");
    expect(fecha).toHaveValue(TODAY);
    expect(fecha).toHaveAttribute("max", TODAY);
  });

  it("vaciar la fecha deshabilita Guardar", async () => {
    const { sheet } = setup();
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Nombre" }), "Caja");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Valor en pesos" }), "100");
    await userEvent.clear(within(sheet).getByLabelText("Fecha de valuación"));
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("no ofrece Borrar ni historial", () => {
    const { sheet } = setup();
    expect(within(sheet).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("list", { name: "valuaciones" })).not.toBeInTheDocument();
  });
});

describe("ManualAssetEditor para editar", () => {
  it("trae el valor de la última valuación y no deja cambiar la moneda", () => {
    const { sheet } = setup({ asset: ahorros });
    expect(within(sheet).getByRole("textbox", { name: "Nombre" })).toHaveValue("Ahorros");
    expect(within(sheet).getByRole("textbox", { name: "Valor en dólares" })).toHaveValue("5.000");
    expect(within(sheet).getByRole("button", { name: "Pesos" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Dólares" })).toBeDisabled();
    expect(within(sheet).getByText("La moneda no se puede cambiar")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("lista las valuaciones de la más nueva a la más vieja y borra una", async () => {
    const { sheet, onDeleteValuation } = setup({ asset: ahorros });
    const history = within(sheet).getByRole("list", { name: "valuaciones" });
    const rows = within(history).getAllByRole("listitem").map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("2026-10-01");
    expect(rows[1]).toContain("2026-08-01");
    await userEvent.click(within(sheet).getByRole("button", { name: "borrar valuación del 2026-08-01" }));
    expect(onDeleteValuation).toHaveBeenCalledWith("2026-08-01");
  });

  it("con una sola valuación no muestra el historial", () => {
    const { sheet } = setup({ asset: { ...ahorros, valuaciones: [{ fecha: "2026-10-01", monto: 5000 }] } });
    expect(within(sheet).queryByRole("list", { name: "valuaciones" })).not.toBeInTheDocument();
  });

  it("Borrar pide borrar el activo", async () => {
    const { sheet, onDelete, onSave } = setup({ asset: ahorros });
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("muestra el error del server", () => {
    const { sheet } = setup({ asset: ahorros, error: "Activo no encontrado" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Activo no encontrado");
  });
});

describe("ManualAssetEditor en mobile", () => {
  it("es una hoja desde abajo con teclado decimal para el valor", () => {
    emulateMobile();
    const { sheet } = setup();
    expect(sheet.closest(".MuiDrawer-root")).not.toBeNull();
    expect(within(sheet).getByRole("textbox", { name: "Valor en pesos" })).toHaveAttribute("inputmode", "decimal");
  });
});
