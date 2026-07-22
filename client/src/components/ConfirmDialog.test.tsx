import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("muestra el mensaje cuando está abierto", () => {
    renderWithProviders(
      <ConfirmDialog open title="Borrar" message="¿Seguro?" confirmLabel="Borrar"
        onConfirm={() => undefined} onClose={() => undefined} />,
    );
    expect(screen.getByText("¿Seguro?")).toBeInTheDocument();
  });

  it("confirmar dispara onConfirm y cancelar dispara onClose", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <ConfirmDialog open title="Borrar" message="¿Seguro?" confirmLabel="Borrar"
        onConfirm={onConfirm} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
