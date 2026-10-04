import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Button } from "@mui/material";
import { cssFor } from "../testing/cssFor.js";
import { BottomSheet } from "./BottomSheet.js";

afterEach(cleanup);

const noop = () => undefined;

describe("BottomSheet", () => {
  it("abierta muestra título, contenido y acciones dentro de un diálogo", () => {
    render(
      <BottomSheet open onClose={noop} title="Filtros" actions={<Button>Listo</Button>}>
        <p>contenido</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Filtros" });
    expect(within(dialog).getByText("Filtros")).toBeInTheDocument();
    expect(within(dialog).getByText("contenido")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Listo" })).toBeInTheDocument();
  });

  it("cerrada no renderiza el diálogo", () => {
    render(<BottomSheet open={false} onClose={noop} title="Filtros"><p>contenido</p></BottomSheet>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
  });

  it("Escape pide cerrar", () => {
    const onClose = vi.fn();
    render(<BottomSheet open onClose={onClose} title="Filtros"><p>contenido</p></BottomSheet>);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Filtros" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("un título largo sin espacios se corta en vez de desbordar la hoja", () => {
    const title = "DB.RG 5617 30% ( ) ________________________________________";
    render(<BottomSheet open onClose={noop} title={title}><p>contenido</p></BottomSheet>);
    const heading = within(screen.getByRole("dialog", { name: title })).getByText(title);
    expect(cssFor(heading)).toContain("overflow-wrap:anywhere");
  });
});
