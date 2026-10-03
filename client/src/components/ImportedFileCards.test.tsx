import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ImportedFileCards } from "./ImportedFileCards.js";

const rows: ImportedFileDTO[] = [
  { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
    documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
  { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
    documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: true },
];

afterEach(cleanup);

const setup = (items: ImportedFileDTO[] = rows) => {
  const onDelete = vi.fn();
  renderWithProviders(<ImportedFileCards rows={items} onDelete={onDelete} />);
  return onDelete;
};

describe("ImportedFileCards", () => {
  it("muestra una tarjeta por archivo, el más reciente primero", () => {
    setup();
    expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual(["visa-julio.pdf", "recibo-junio.pdf"]);
  });

  it("cada tarjeta lleva tipo, detalle, fechas y la marca de revisar", () => {
    setup();
    const visa = within(screen.getByRole("article", { name: "visa-julio.pdf" }));
    expect(visa.getByText("Tarjeta")).toBeInTheDocument();
    expect(visa.getByText("revisar")).toBeInTheDocument();
    expect(visa.getByText("Visa ****1234 · 3 movimientos")).toBeInTheDocument();
    expect(visa.getByText("2026-07-02")).toBeInTheDocument();
    expect(visa.getByText("2026-07-05")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "recibo-junio.pdf" })).queryByText("revisar")).not.toBeInTheDocument();
  });

  it("borrar pide confirmación avisando que se van los movimientos y recién ahí llama onDelete", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar visa-julio.pdf" }));
    const confirm = screen.getByRole("dialog", { name: "Borrar archivo" });
    expect(within(confirm).getByText(/también se borran sus movimientos/i)).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(rows[1]);
  });

  it("cancelar no borra", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar recibo-junio.pdf" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Borrar archivo" })).getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("sin archivos que coincidan lo dice en castellano", () => {
    setup([]);
    expect(screen.getByText(/no hay archivos que coincidan/i)).toBeInTheDocument();
  });
});
