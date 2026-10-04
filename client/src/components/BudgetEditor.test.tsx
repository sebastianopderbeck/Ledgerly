import { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { cssFor } from "../testing/cssFor.js";
import { BudgetEditor } from "./BudgetEditor.js";
import type { BudgetEditorTarget } from "./useBudgetForm.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const COMIDA: BudgetDTO = { id: "b1", category: "Comida", topeArs: 300000, ajustaInflacion: true, periodoBase: "2026-08" };
const NEW: BudgetEditorTarget = { budget: null, category: null };
const noop = () => undefined;

interface EditorSetup {
  target?: BudgetEditorTarget;
  initialTope?: number | null;
  latestIpc?: string | null;
  categoryOptions?: string[];
}

const renderEditor = ({ target = NEW, initialTope = null, latestIpc = "2026-08", categoryOptions = ["Farmacia", "Ropa"] }: EditorSetup = {}) => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onDelete = vi.fn();
  renderWithProviders(
    <BudgetEditor
      open
      target={target}
      editorKey={1}
      categoryOptions={categoryOptions}
      initialTope={initialTope}
      latestIpc={latestIpc}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />,
  );
  return { onClose, onSave, onDelete };
};

const amountField = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: "Tope mensual (ARS)" });

const Reopening = () => {
  const [editorKey, setEditorKey] = useState(1);
  const reopen = () => setEditorKey((key) => key + 1);
  return (
    <>
      <button type="button" onClick={reopen}>reabrir</button>
      <BudgetEditor
        open
        target={NEW}
        editorKey={editorKey}
        categoryOptions={["Ropa"]}
        initialTope={null}
        latestIpc={null}
        onClose={noop}
        onSave={noop}
        onDelete={noop}
      />
    </>
  );
};

describe("BudgetEditor", () => {
  it("un tope nuevo elige la categoría, lee el monto en formato argentino y guarda", async () => {
    emulateDesktop();
    const { onSave, onClose } = renderEditor();
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Categoría" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ropa" }));
    await userEvent.type(amountField(dialog), "1.500,50");
    expect(within(dialog).getByText(/^= \$\s1\.500,50 por mes$/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ category: "Ropa", topeArs: 1500.5, ajustaInflacion: false });
    expect(onClose).toHaveBeenCalled();
  });

  it("con un monto que no es mayor a cero no deja guardar y marca el campo", async () => {
    emulateDesktop();
    renderEditor({ target: { budget: null, category: "Farmacia" } });
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    const save = within(dialog).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.type(amountField(dialog), "0");
    expect(save).toBeDisabled();
    expect(within(dialog).getByText("Ingresá un monto mayor a cero")).toBeInTheDocument();
    expect(amountField(dialog)).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(amountField(dialog));
    await userEvent.type(amountField(dialog), "abc");
    expect(save).toBeDisabled();
  });

  it("sin categoría elegida no deja guardar aunque haya monto", async () => {
    emulateDesktop();
    renderEditor();
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    await userEvent.type(amountField(dialog), "1000");
    expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("al editar fija la categoría, precarga el monto y ofrece Borrar", async () => {
    emulateDesktop();
    const { onDelete } = renderEditor({ target: { budget: COMIDA, category: "Comida" }, initialTope: 312000 });
    const dialog = screen.getByRole("dialog", { name: "Tope de Comida" });
    const category = within(dialog).getByRole("textbox", { name: "Categoría" });
    expect(category).toBeDisabled();
    expect(category).toHaveValue("Comida");
    expect(amountField(dialog)).toHaveValue("312.000");
    expect(within(dialog).getByLabelText("Ajustar por inflación")).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(COMIDA);
  });

  it("desde «Poner tope» la categoría viene fija y no hay Borrar", async () => {
    emulateDesktop();
    const { onSave } = renderEditor({ target: { budget: null, category: "Farmacia" } });
    const dialog = screen.getByRole("dialog", { name: "Nuevo tope" });
    expect(within(dialog).getByRole("textbox", { name: "Categoría" })).toHaveValue("Farmacia");
    expect(within(dialog).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    await userEvent.type(amountField(dialog), "50.000");
    await userEvent.click(within(dialog).getByLabelText("Ajustar por inflación"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ category: "Farmacia", topeArs: 50000, ajustaInflacion: true });
  });

  it("Cancelar cierra sin guardar", async () => {
    emulateDesktop();
    const { onSave, onClose } = renderEditor();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Nuevo tope" })).getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("explica en qué pesos queda un tope ajustado", () => {
    emulateDesktop();
    renderEditor();
    expect(screen.getByText(/^Queda en pesos de agosto de 2026: sube cada mes con el IPC publicado/)).toBeInTheDocument();
  });

  it("avisa cuando todavía no hay IPC cargado", () => {
    emulateDesktop();
    renderEditor({ latestIpc: null });
    expect(screen.getByText(/^Todavía no hay IPC cargado/)).toBeInTheDocument();
  });

  it("avisa cuando todas las categorías ya tienen tope", () => {
    emulateDesktop();
    renderEditor({ categoryOptions: [] });
    expect(screen.getByText("Todas las categorías ya tienen tope.")).toBeInTheDocument();
  });

  it("cada apertura nueva arranca vacía", async () => {
    emulateDesktop();
    renderWithProviders(<Reopening />);
    await userEvent.type(amountField(screen.getByRole("dialog", { name: "Nuevo tope" })), "1000");
    fireEvent.click(screen.getByRole("button", { name: "reabrir", hidden: true }));
    expect(amountField(screen.getByRole("dialog", { name: "Nuevo tope" }))).toHaveValue("");
  });

  it("en mobile es una hoja desde abajo con acciones de 44 px", () => {
    emulateMobile();
    renderEditor();
    const sheet = screen.getByRole("dialog", { name: "Nuevo tope" });
    expect(document.querySelector(".MuiDrawer-root")).toBeInTheDocument();
    expect(amountField(sheet)).toHaveAttribute("inputmode", "decimal");
    expect(cssFor(within(sheet).getByRole("button", { name: "Guardar" }))).toContain("min-height:44px");
    expect(cssFor(within(sheet).getByRole("button", { name: "Cancelar" }))).toContain("min-height:44px");
  });
});
