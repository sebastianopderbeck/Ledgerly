import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RateSheet, RateValue, canSaveRate, parseRate } from "./RateSheet.js";

afterEach(cleanup);

const noop = () => undefined;

const rateInput = (title = "TC cuota 6") =>
  within(screen.getByRole("dialog", { name: title })).getByRole("textbox", { name: "TC oficial" });

const saveButton = () =>
  within(screen.getByRole("dialog", { name: "TC cuota 6" })).getByRole("button", { name: "Guardar" });

describe("parseRate y canSaveRate", () => {
  it("acepta coma o punto como separador decimal", () => {
    expect(parseRate("1415,5")).toBe(1415.5);
    expect(parseRate(" 1415.5 ")).toBe(1415.5);
  });

  it("solo deja guardar un TC mayor a cero y distinto del actual", () => {
    expect(canSaveRate(1400, 1350)).toBe(true);
    expect(canSaveRate(1400, null)).toBe(true);
    expect(canSaveRate(1350, 1350)).toBe(false);
    expect(canSaveRate(0, 1350)).toBe(false);
    expect(canSaveRate(-5, 1350)).toBe(false);
    expect(canSaveRate(parseRate(""), 1350)).toBe(false);
    expect(canSaveRate(parseRate("abc"), 1350)).toBe(false);
  });
});

describe("RateSheet", () => {
  it("abre con el TC actual y pide el teclado decimal", () => {
    render(<RateSheet open title="TC cuota 6" current={1350} onSave={noop} onClose={noop} />);
    expect(rateInput()).toHaveValue("1350");
    expect(rateInput()).toHaveAttribute("inputmode", "decimal");
  });

  it("sin TC cargado arranca vacía", () => {
    render(<RateSheet open title="TC cuota 6" current={null} onSave={noop} onClose={noop} />);
    expect(rateInput()).toHaveValue("");
  });

  it("guarda el TC escrito con coma, como lo escribe el teclado del iPhone en castellano", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<RateSheet open title="TC cuota 6" current={1350} onSave={onSave} onClose={onClose} />);
    await userEvent.clear(rateInput());
    await userEvent.type(rateInput(), "1415,5");
    await userEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(1415.5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no deja guardar el mismo TC ni uno menor o igual a cero", async () => {
    const onSave = vi.fn();
    render(<RateSheet open title="TC cuota 6" current={1350} onSave={onSave} onClose={noop} />);
    expect(saveButton()).toBeDisabled();
    await userEvent.clear(rateInput());
    await userEvent.type(rateInput(), "0");
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("si se reabre enseguida para otro registro, muestra el TC de ese registro y no lo que se había tipeado", () => {
    const { rerender } = render(<RateSheet open title="TC cuota 1" current={1350} onSave={noop} onClose={noop} />);
    fireEvent.change(rateInput("TC cuota 1"), { target: { value: "999" } });
    rerender(<RateSheet open={false} title="TC cuota 1" current={1350} onSave={noop} onClose={noop} />);
    rerender(<RateSheet open title="TC cuota 6" current={1400} onSave={noop} onClose={noop} />);
    expect(rateInput("TC cuota 6")).toHaveValue("1400");
  });
});

describe("RateValue", () => {
  it("muestra el TC y el lápiz pide editarlo", async () => {
    const onEdit = vi.fn();
    render(<RateValue rate={null} editLabel="editar TC cuota 6" onEdit={onEdit} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "editar TC cuota 6" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
