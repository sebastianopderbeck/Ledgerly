import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { emulateMobile } from "../testing/viewport.js";
import { FileDropzone } from "./FileDropzone.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const dropzone = () => screen.getByText(/arrastrá el pdf/i).parentElement!;
const drop = (file: File) => fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } });
const pdf = () => new File(["x"], "resumen.pdf", { type: "application/pdf" });
const txt = () => new File(["x"], "notas.txt", { type: "text/plain" });

describe("FileDropzone", () => {
  it("acepta un PDF soltado", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("ignora un archivo que no es PDF soltado", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(txt());
    expect(onFile).not.toHaveBeenCalled();
  });

  it("avisa al usuario cuando el archivo soltado no es PDF", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    drop(txt());
    expect(screen.getByText(/sólo se aceptan archivos pdf/i)).toBeInTheDocument();
  });

  it("limpia el aviso cuando después se suelta un PDF válido", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(txt());
    drop(pdf());
    expect(screen.queryByText(/sólo se aceptan archivos pdf/i)).not.toBeInTheDocument();
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("sigue aceptando PDFs elegidos por el input", async () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
  });
});

describe("FileDropzone en mobile", () => {
  beforeEach(() => emulateMobile());

  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("no habla de arrastrar y ofrece «Elegir PDF»", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    expect(screen.queryByText(/arrastrá el pdf/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elegir archivo" })).not.toBeInTheDocument();
  });

  it("«Elegir PDF» abre el selector de archivos", async () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    const opened = vi.fn();
    fileInput().addEventListener("click", opened);
    await userEvent.click(screen.getByRole("button", { name: "Elegir PDF" }));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("acepta el PDF elegido y avisa si lo elegido no es PDF", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    await user.upload(fileInput(), txt());
    expect(screen.getByText(/sólo se aceptan archivos pdf/i)).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    await user.upload(fileInput(), pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sólo se aceptan archivos pdf/i)).not.toBeInTheDocument();
  });
});
