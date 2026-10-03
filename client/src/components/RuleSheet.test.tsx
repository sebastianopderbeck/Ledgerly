import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RuleSheet } from "./RuleSheet.js";

afterEach(cleanup);

const uber: CategoryRuleDTO = {
  id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true,
};

const setup = (rule: CategoryRuleDTO | null) => {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(<RuleSheet open rule={rule} onClose={onClose} onSave={onSave} onDelete={onDelete} />);
  const sheet = screen.getByRole("dialog", { name: rule ? "Editar regla" : "Nueva regla" });
  return { onSave, onDelete, onClose, sheet };
};

describe("RuleSheet para editar", () => {
  it("muestra prioridad, tipo, patrón y categoría de la regla", () => {
    const { sheet } = setup(uber);
    expect(within(sheet).getByRole("textbox", { name: "Prioridad" })).toHaveValue("10");
    expect(within(sheet).getByRole("combobox", { name: "Tipo" })).toHaveTextContent("contiene");
    expect(within(sheet).getByRole("textbox", { name: "Patrón" })).toHaveValue("UBER");
    expect(within(sheet).getByRole("textbox", { name: "Categoría" })).toHaveValue("Transporte");
  });

  it("Guardar manda la regla con los cambios y cierra", async () => {
    const { sheet, onSave, onClose } = setup(uber);
    const category = within(sheet).getByRole("textbox", { name: "Categoría" });
    await userEvent.clear(category);
    await userEvent.type(category, "Viajes");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ priority: 10, matchType: "contains", pattern: "UBER", category: "Viajes" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("deja cambiar el tipo a regex", async () => {
    const { sheet, onSave } = setup(uber);
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Tipo" }));
    await userEvent.click(await screen.findByRole("option", { name: "regex" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Editar regla" })).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ priority: 10, matchType: "regex", pattern: "UBER", category: "Transporte" });
  });

  it("sin prioridad no deja guardar", async () => {
    const { sheet } = setup(uber);
    await userEvent.clear(within(sheet).getByRole("textbox", { name: "Prioridad" }));
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("Borrar pide borrar la regla sin guardar", async () => {
    const { sheet, onSave, onDelete } = setup(uber);
    await userEvent.click(within(sheet).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(uber);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("RuleSheet para una regla nueva", () => {
  it("arranca vacía, sin prioridad ni Borrar", () => {
    const { sheet } = setup(null);
    expect(within(sheet).queryByRole("textbox", { name: "Prioridad" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Borrar" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("textbox", { name: "Patrón" })).toHaveValue("");
    expect(within(sheet).getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("el patrón no se corrige ni se capitaliza con el teclado del celular", () => {
    const { sheet } = setup(null);
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    expect(pattern).toHaveAttribute("autocapitalize", "none");
    expect(pattern).toHaveAttribute("autocorrect", "off");
    expect(pattern).toHaveAttribute("spellcheck", "false");
  });

  it("con patrón y categoría guarda con prioridad 100", async () => {
    const { sheet, onSave } = setup(null);
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Patrón" }), "RAPPI");
    await userEvent.type(within(sheet).getByRole("textbox", { name: "Categoría" }), "Delivery");
    await userEvent.click(within(sheet).getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith({ priority: 100, matchType: "contains", pattern: "RAPPI", category: "Delivery" });
  });
});
