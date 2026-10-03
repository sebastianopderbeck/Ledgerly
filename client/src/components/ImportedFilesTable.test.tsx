import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImportedFileDTO } from "@ledgerly/shared";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { ImportedFilesTable } from "./ImportedFilesTable.js";

const rows: ImportedFileDTO[] = [
  { id: "s1", kind: "statement", fileName: "visa-julio.pdf", uploadedAt: "2026-07-05T12:00:00.000Z",
    documentDate: "2026-07-02", description: "Visa ****1234 · 3 movimientos", needsReview: true },
  { id: "p1", kind: "payslip", fileName: "recibo-junio.pdf", uploadedAt: "2026-07-04T12:00:00.000Z",
    documentDate: "2026-06-30", description: "Período 2026-06", needsReview: false },
];

afterEach(cleanup);

const setup = (items: ImportedFileDTO[] = rows) => {
  const onDelete = vi.fn();
  renderWithProviders(<ImportedFilesTable rows={items} onDelete={onDelete} />);
  return onDelete;
};

const rowOf = (fileName: string) => screen.getByText(fileName).closest('[role="row"]') as HTMLElement;

describe("ImportedFilesTable", () => {
  it("muestra cada archivo con su tipo, detalle y fechas", () => {
    setup();
    const visa = within(rowOf("visa-julio.pdf"));
    expect(visa.getByText("Tarjeta")).toBeInTheDocument();
    expect(visa.getByText("Visa ****1234 · 3 movimientos")).toBeInTheDocument();
    expect(visa.getByText("2026-07-02")).toBeInTheDocument();
    expect(visa.getByText("2026-07-05")).toBeInTheDocument();
    expect(within(rowOf("recibo-junio.pdf")).getByText("Sueldo")).toBeInTheDocument();
  });

  it("marca con un chip los archivos que hay que revisar", () => {
    setup();
    expect(within(rowOf("visa-julio.pdf")).getByText("revisar")).toBeInTheDocument();
    expect(within(rowOf("recibo-junio.pdf")).queryByText("revisar")).not.toBeInTheDocument();
  });

  it("borrar + confirmar llama onDelete con el archivo", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar recibo-junio.pdf" }));
    expect(screen.getByText(/¿borrar recibo-junio\.pdf\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(onDelete).toHaveBeenCalledWith(rows[1]);
  });

  it("avisa que borrar un resumen también borra sus movimientos", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar visa-julio.pdf" }));
    expect(screen.getByText(/también se borran sus movimientos/i)).toBeInTheDocument();
  });

  it("cancelar no llama onDelete", async () => {
    const onDelete = setup();
    await userEvent.click(screen.getByRole("button", { name: "borrar visa-julio.pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("sin filas muestra un mensaje en castellano", () => {
    setup([]);
    expect(screen.getByText(/no hay archivos que coincidan/i)).toBeInTheDocument();
  });
});
