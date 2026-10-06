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

const REJECTED = /sólo se aceptan pdf o imágenes/i;
const dropzone = () => screen.getByText(/arrastrá el pdf o la captura del crédito/i).parentElement!;
const drop = (file: File) => fireEvent.drop(dropzone(), { dataTransfer: { files: [file] } });
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pdf = () => new File(["x"], "resumen.pdf", { type: "application/pdf" });
const png = () => new File(["x"], "cuota.png", { type: "image/png" });
const heicWithoutType = () => new File(["x"], "IMG_0001.HEIC", { type: "" });
const txt = () => new File(["x"], "notas.txt", { type: "text/plain" });

describe("FileDropzone", () => {
  it("acepta un PDF soltado", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("acepta una captura PNG soltada", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(png());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0].name).toBe("cuota.png");
  });

  it("acepta una captura HEIC aunque el navegador no informe el tipo", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(heicWithoutType());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("ignora un archivo que no es PDF ni imagen", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(txt());
    expect(onFile).not.toHaveBeenCalled();
  });

  it("avisa al usuario cuando el archivo soltado no es PDF ni imagen", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    drop(txt());
    expect(screen.getByText(REJECTED)).toBeInTheDocument();
  });

  it("limpia el aviso cuando después se suelta un archivo válido", () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    drop(txt());
    drop(png());
    expect(screen.queryByText(REJECTED)).not.toBeInTheDocument();
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("sigue aceptando PDFs elegidos por el input", async () => {
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    await userEvent.upload(fileInput(), pdf());
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it("el selector de archivos ofrece PDF e imágenes", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    expect(fileInput().accept).toBe("application/pdf,image/png,image/jpeg,image/heic");
  });
});

describe("FileDropzone en mobile", () => {
  beforeEach(() => emulateMobile());

  it("no habla de arrastrar y ofrece «Elegir archivo»", () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    expect(screen.queryByText(/arrastrá/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elegir PDF" })).not.toBeInTheDocument();
  });

  it("«Elegir archivo» abre el selector de archivos", async () => {
    renderWithProviders(<FileDropzone onFile={vi.fn()} />);
    const opened = vi.fn();
    fileInput().addEventListener("click", opened);
    await userEvent.click(screen.getByRole("button", { name: "Elegir archivo" }));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("acepta la captura elegida y avisa si lo elegido no es PDF ni imagen", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onFile = vi.fn();
    renderWithProviders(<FileDropzone onFile={onFile} />);
    await user.upload(fileInput(), txt());
    expect(screen.getByText(REJECTED)).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    await user.upload(fileInput(), png());
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(REJECTED)).not.toBeInTheDocument();
  });
});
