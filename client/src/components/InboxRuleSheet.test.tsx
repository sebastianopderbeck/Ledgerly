import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { InboxRuleSheet } from "./InboxRuleSheet.js";

afterEach(cleanup);

const panaderia: UncategorizedGroupDTO = {
  pattern: "PANADERIA LA ESPIGA", merchants: ["PANADERIA LA ESPIGA"], count: 6, totalArs: 21400, totalUsd: 0,
  equivalentArs: 21400, lastDate: "2026-09-28",
};
const steam: UncategorizedGroupDTO = {
  pattern: "STEAMGAMES.COM", merchants: ["STEAMGAMES.COM 4259522985", "STEAMGAMES.COM 4259518112"], count: 2,
  totalArs: 0, totalUsd: 19.98, equivalentArs: 28271.7, lastDate: "2026-09-14",
};

interface SetupOptions {
  group?: UncategorizedGroupDTO;
  categories?: string[];
}

const setup = ({ group = panaderia, categories = ["Comida", "Transporte"] }: SetupOptions = {}) => {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <InboxRuleSheet open group={group} groups={[panaderia, steam]} categories={categories} creating={false} onClose={onClose} onCreate={onCreate} />,
  );
  const sheet = screen.getByRole("dialog", { name: group.merchants[0] });
  return { onCreate, onClose, sheet };
};

describe("InboxRuleSheet", () => {
  it("muestra movimientos, total, último y las variantes", () => {
    const { sheet } = setup({ group: steam });
    expect(within(sheet).getByText("Movimientos")).toBeInTheDocument();
    expect(within(sheet).getByText("2026-09-14")).toBeInTheDocument();
    expect(within(sheet).getByText("STEAMGAMES.COM 4259522985 · STEAMGAMES.COM 4259518112")).toBeInTheDocument();
  });

  it("precarga el patrón sugerido sin autocapitalizar ni corregir", () => {
    const { sheet } = setup();
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    expect(pattern).toHaveValue("PANADERIA LA ESPIGA");
    expect(pattern).toHaveAttribute("autocapitalize", "none");
    expect(pattern).toHaveAttribute("autocorrect", "off");
    expect(pattern).toHaveAttribute("spellcheck", "false");
  });

  it("los botones de categoría marcan la elegida", async () => {
    const { sheet } = setup();
    await userEvent.click(within(sheet).getByRole("button", { name: "Comida" }));
    expect(within(sheet).getByRole("button", { name: "Comida" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: "Transporte" })).toHaveAttribute("aria-pressed", "false");
  });

  it("«Crear regla» se habilita solo con categoría y patrón válido", async () => {
    const { sheet } = setup();
    const create = within(sheet).getByRole("button", { name: "Crear regla" });
    expect(create).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Comida" }));
    expect(create).toBeEnabled();
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "PA");
    expect(within(sheet).getByText("Mínimo 3 caracteres")).toBeInTheDocument();
    expect(create).toBeDisabled();
  });

  it("crea con el patrón recortado y le pasa onClose para cerrar al terminar", async () => {
    const { sheet, onCreate, onClose } = setup();
    const pattern = within(sheet).getByRole("textbox", { name: "Patrón" });
    await userEvent.clear(pattern);
    await userEvent.type(pattern, "  panaderia  ");
    await userEvent.click(within(sheet).getByRole("button", { name: "Comida" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Crear regla" }));
    expect(onCreate).toHaveBeenCalledWith({ pattern: "panaderia", category: "Comida" }, onClose);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("«Ver movimientos» lleva a Movimientos filtrado por el comercio", () => {
    const { sheet } = setup();
    expect(within(sheet).getByRole("link", { name: "Ver movimientos" }))
      .toHaveAttribute("href", "/transactions?year=all&category=Sin+categor%C3%ADa&search=PANADERIA+LA+ESPIGA");
  });

  it("sin categorías avisa cómo crear una", () => {
    const { sheet } = setup({ categories: [] });
    expect(within(sheet).getByText("Todavía no hay categorías. Creá una desde «Nueva regla».")).toBeInTheDocument();
  });
});
