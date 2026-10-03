import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { MacroAssumptionsBar } from "./MacroAssumptionsBar.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const assumptions = { inflacionEsperada: 30, tasaAnualPesos: 35, reversionMeses: 12 as const };

const noop = () => undefined;

const openAssumptions = () => fireEvent.click(screen.getByRole("button", { name: "Ver supuestos" }));

const reversionGroup = () => screen.getByRole("group", { name: "Horizonte de reversión del dólar" });

const inflationField = () => screen.getByLabelText("Inflación esperada (% anual)").closest(".MuiFormControl-root");

describe("MacroAssumptionsBar", () => {
  it("en mobile apila las opciones de reversión y ocupa todo el ancho", async () => {
    emulateMobile();
    renderWithProviders(<MacroAssumptionsBar assumptions={assumptions} onChange={noop} />);
    openAssumptions();
    await waitFor(() => expect(reversionGroup()).toHaveClass("MuiToggleButtonGroup-vertical"));
    expect(reversionGroup()).toHaveClass("MuiToggleButtonGroup-fullWidth");
    expect(inflationField()).toHaveClass("MuiFormControl-fullWidth");
  });

  it("en compu deja las opciones en fila y los campos con su ancho", async () => {
    emulateDesktop();
    renderWithProviders(<MacroAssumptionsBar assumptions={assumptions} onChange={noop} />);
    openAssumptions();
    await waitFor(() => expect(reversionGroup()).toHaveClass("MuiToggleButtonGroup-horizontal"));
    expect(reversionGroup()).not.toHaveClass("MuiToggleButtonGroup-fullWidth");
    expect(inflationField()).not.toHaveClass("MuiFormControl-fullWidth");
  });
});
