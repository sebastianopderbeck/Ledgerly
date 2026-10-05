import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Button } from "@mui/material";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateDesktop, emulateMobile } from "../testing/viewport.js";
import { ResponsiveSheet } from "./ResponsiveSheet.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const noop = () => undefined;

const renderSheet = (open = true, onClose = noop) =>
  renderWithProviders(
    <ResponsiveSheet open={open} onClose={onClose} title="Nuevo activo" actions={<Button>Guardar</Button>}>
      <p>formulario</p>
    </ResponsiveSheet>,
  );

describe("ResponsiveSheet", () => {
  it("en compu es un diálogo con título, contenido y acciones", () => {
    emulateDesktop();
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Nuevo activo" });
    expect(within(dialog).getByText("formulario")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(document.querySelector(".MuiDrawer-root")).not.toBeInTheDocument();
  });

  it("en mobile es una hoja desde abajo con el mismo nombre", () => {
    emulateMobile();
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "Nuevo activo" });
    expect(within(dialog).getByText("formulario")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(document.querySelector(".MuiDrawer-root")).toBeInTheDocument();
  });

  it("cerrada no muestra nada", () => {
    emulateDesktop();
    renderSheet(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape pide cerrar", () => {
    emulateDesktop();
    const onClose = vi.fn();
    renderSheet(true, onClose);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Nuevo activo" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
