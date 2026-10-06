import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TransactionDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { cssFor } from "../testing/cssFor.js";
import { TransactionsList } from "./TransactionsList.js";

const tx = (id: string, merchant: string, overrides: Partial<TransactionDTO> = {}): TransactionDTO => ({
  id, statementId: "s", issuer: "icbc", cardLabel: "ICBC", date: "2026-05-04",
  descriptionRaw: merchant, merchant, category: "Compras", categorySource: "rule",
  amount: 1500, currency: "ARS", direction: "debit", type: "purchase", isInstallment: false,
  installmentCurrent: null, installmentTotal: null, comprobante: null, ...overrides,
});

const rows: TransactionDTO[] = [
  tx("1", "MERCADOLIBRE"),
  tx("2", "SU PAGO", { category: "Sin categoría", amount: 5000, direction: "credit", type: "payment", date: "2026-06-08" }),
  tx("3", "NOTEBOOK", {
    category: "Tecnología", amount: 45000, date: "2026-06-10", isInstallment: true, installmentCurrent: 3, installmentTotal: 12,
  }),
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(["Compras", "Tecnología"]), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const setup = (items: TransactionDTO[] = rows) => {
  const onCategoryChange = vi.fn();
  const onDelete = vi.fn();
  renderWithProviders(
    <TransactionsList rows={items} onCategoryChange={onCategoryChange} onDelete={onDelete} onMarkSubscription={vi.fn()} />,
  );
  return { onCategoryChange, onDelete };
};

const FilterHarness = ({ onDelete }: { onDelete: (ids: string[]) => void }) => {
  const [filtered, setFiltered] = useState(false);
  const shown = filtered ? rows.filter((item) => item.id !== "3") : rows;
  return (
    <>
      <button onClick={() => setFiltered(true)}>filtrar</button>
      <TransactionsList rows={shown} onCategoryChange={vi.fn()} onDelete={onDelete} onMarkSubscription={vi.fn()} />
    </>
  );
};

const fillers = Array.from({ length: 49 }, (_unused, index) => tx(`f${index}`, `RELLENO ${index}`));

const PushPastPageHarness = ({ onDelete }: { onDelete: (ids: string[]) => void }) => {
  const [pushed, setPushed] = useState(false);
  const shown = pushed ? [rows[0], ...fillers, rows[2]] : rows;
  return (
    <>
      <button onClick={() => setPushed(true)}>filtrar</button>
      <TransactionsList rows={shown} onCategoryChange={vi.fn()} onDelete={onDelete} onMarkSubscription={vi.fn()} />
    </>
  );
};

const row = (merchant: string) => screen.getByRole("button", { name: new RegExp(merchant) });

const confirmDialog = () => screen.getByRole("dialog", { name: "Borrar movimientos" });

describe("TransactionsList", () => {
  it("muestra cada movimiento como fila, con su cuota, y no una grilla", () => {
    setup();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(within(row("NOTEBOOK")).getByText("3/12")).toBeInTheDocument();
    expect(within(row("NOTEBOOK")).getByText("Tecnología")).toBeInTheDocument();
    expect(within(row("NOTEBOOK")).getByText("2026-06-10")).toBeInTheDocument();
    expect(screen.getByText("3 movimientos")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("muestra 50 filas y «Ver más» suma de a 50", async () => {
    const many = Array.from({ length: 120 }, (_unused, index) => tx(`t${index}`, `COMERCIO ${index}`));
    setup(many);
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(100);
    await userEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(120);
    expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
  });

  it("tocar una fila abre su hoja y cambiar la categoría llama onCategoryChange", async () => {
    const { onCategoryChange } = setup();
    await userEvent.click(row("NOTEBOOK"));
    const sheet = screen.getByRole("dialog", { name: "NOTEBOOK" });
    const category = within(sheet).getByRole("combobox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onCategoryChange).toHaveBeenCalledWith("3", "Viajes");
  });

  it("Borrar desde la hoja pasa por la confirmación", async () => {
    const { onDelete } = setup();
    await userEvent.click(row("NOTEBOOK"));
    await userEvent.click(within(screen.getByRole("dialog", { name: "NOTEBOOK" })).getByRole("button", { name: "Borrar" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(within(confirmDialog()).getByText(/¿borrar este movimiento\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["3"]);
  });

  it("Borrar desde la hoja y después Cancelar no borra nada", async () => {
    const { onDelete } = setup();
    await userEvent.click(row("NOTEBOOK"));
    await userEvent.click(within(screen.getByRole("dialog", { name: "NOTEBOOK" })).getByRole("button", { name: "Borrar" }));
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("«Seleccionar» + «Borrar (2)» + confirmar llama onDelete con los dos ids y sale del modo selección", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar MERCADOLIBRE" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar NOTEBOOK" }));
    const bar = screen.getByRole("toolbar", { name: "selección" });
    await userEvent.click(within(bar).getByRole("button", { name: "Borrar (2)" }));
    expect(within(confirmDialog()).getByText(/¿borrar 2 movimientos\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1", "3"]);
    expect(screen.queryByRole("toolbar", { name: "selección" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("en modo selección, tocar la fila la marca y no abre la hoja", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(row("SU PAGO"));
    expect(screen.getByRole("checkbox", { name: "seleccionar SU PAGO" })).toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar (1)" })).toBeEnabled();
  });

  it("«Cancelar» sale del modo selección sin borrar", async () => {
    const { onDelete } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar MERCADOLIBRE" }));
    await userEvent.click(within(screen.getByRole("toolbar", { name: "selección" })).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("toolbar", { name: "selección" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("la barra de selección queda arriba de la navegación y la lista le deja lugar", async () => {
    setup();
    expect(cssFor(screen.getByRole("region", { name: "movimientos" }))).not.toContain("padding-bottom:64px");
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    expect(cssFor(screen.getByRole("toolbar", { name: "selección" }))).toContain("bottom:calc(64px + env(safe-area-inset-bottom))");
    expect(cssFor(screen.getByRole("region", { name: "movimientos" }))).toContain("padding-bottom:64px");
  });

  it("si un filtro oculta filas marcadas, la selección y el borrado las ignoran", async () => {
    const onDelete = vi.fn();
    renderWithProviders(<FilterHarness onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar MERCADOLIBRE" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar NOTEBOOK" }));
    expect(screen.getByRole("button", { name: "Borrar (2)" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "filtrar" }));
    const bar = screen.getByRole("toolbar", { name: "selección" });
    await userEvent.click(within(bar).getByRole("button", { name: "Borrar (1)" }));
    expect(within(confirmDialog()).getByText(/¿borrar este movimiento\?/i)).toBeInTheDocument();
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1"]);
  });

  it("si una fila marcada queda detrás de «Ver más», la selección y el borrado la ignoran", async () => {
    const onDelete = vi.fn();
    renderWithProviders(<PushPastPageHarness onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Seleccionar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar MERCADOLIBRE" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "seleccionar NOTEBOOK" }));
    await userEvent.click(screen.getByRole("button", { name: "filtrar" }));
    expect(screen.queryByRole("checkbox", { name: "seleccionar NOTEBOOK" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver más" })).toBeInTheDocument();
    const bar = screen.getByRole("toolbar", { name: "selección" });
    await userEvent.click(within(bar).getByRole("button", { name: "Borrar (1)" }));
    await userEvent.click(within(confirmDialog()).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(["1"]);
  });
});
