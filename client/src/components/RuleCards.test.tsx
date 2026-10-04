import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RuleCards } from "./RuleCards.js";

afterEach(cleanup);

const rules: CategoryRuleDTO[] = [
  { id: "r1", priority: 10, matchType: "contains", pattern: "UBER", category: "Transporte", source: "user", enabled: true },
  { id: "r2", priority: 50, matchType: "regex", pattern: "^NETFLIX", category: "Suscripciones", source: "system", enabled: false },
];

const setup = () => {
  const onEdit = vi.fn();
  const onToggle = vi.fn();
  renderWithProviders(<RuleCards rules={rules} onEdit={onEdit} onToggle={onToggle} />);
  return { onEdit, onToggle };
};

describe("RuleCards", () => {
  it("muestra patrón, categoría, tipo y prioridad de cada regla", () => {
    setup();
    const uber = screen.getByRole("article", { name: "UBER" });
    expect(within(uber).getByText("Transporte")).toBeInTheDocument();
    expect(within(uber).getByText("contiene · prioridad 10")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "^NETFLIX" })).getByText("regex · prioridad 50")).toBeInTheDocument();
  });

  it("el switch refleja si la regla está activa y avisa al cambiarlo", async () => {
    const { onToggle } = setup();
    expect(screen.getByRole("checkbox", { name: "activa UBER" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "activa ^NETFLIX" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "activa UBER" }));
    expect(onToggle).toHaveBeenCalledWith("r1", false);
  });

  it("tocar la tarjeta pide editar esa regla", async () => {
    const { onEdit, onToggle } = setup();
    await userEvent.click(screen.getByRole("button", { name: "editar UBER" }));
    expect(onEdit).toHaveBeenCalledWith(rules[0]);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
