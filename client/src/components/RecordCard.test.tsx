import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chip, IconButton } from "@mui/material";
import { renderWithProviders } from "../testing/renderWithProviders.js";
import { RecordCard, type RecordField } from "./RecordCard.js";

afterEach(cleanup);

const highlights: RecordField[] = [
  { label: "Total", value: "$ 1.097.687,93" },
  { label: "Pagado USD", value: "US$ 813,10" },
];

const details: RecordField[] = [
  { label: "Capital", value: "$ 184.689,39" },
  { label: "Interés", value: "$ 903.304,93" },
];

const card = () => screen.getByRole("article", { name: "Cuota 6" });

describe("RecordCard", () => {
  it("muestra título, meta y los dos datos destacados", () => {
    renderWithProviders(<RecordCard title="Cuota 6" meta="2026-01-19" highlights={highlights} details={details} />);
    expect(within(card()).getByText("2026-01-19")).toBeInTheDocument();
    expect(within(card()).getByText("Total")).toBeInTheDocument();
    expect(within(card()).getByText("$ 1.097.687,93")).toBeInTheDocument();
    expect(within(card()).getByText("Pagado USD")).toBeInTheDocument();
  });

  it("el detalle está plegado y «Ver detalle» lo despliega", async () => {
    renderWithProviders(<RecordCard title="Cuota 6" highlights={highlights} details={details} />);
    expect(within(card()).queryByText("Capital")).not.toBeInTheDocument();
    const toggle = within(card()).getByRole("button", { name: "Ver detalle" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(within(card()).getByText("Capital")).toBeInTheDocument();
    expect(within(card()).getByText("$ 903.304,93")).toBeInTheDocument();
    expect(within(card()).getByRole("button", { name: "Ocultar detalle" })).toHaveAttribute("aria-expanded", "true");
  });

  it("sin campos de detalle no ofrece «Ver detalle»", () => {
    renderWithProviders(<RecordCard title="Cuota 6" highlights={highlights} details={[]} />);
    expect(within(card()).queryByRole("button", { name: "Ver detalle" })).not.toBeInTheDocument();
  });

  it("muestra la insignia junto al título y la acción de la tarjeta", async () => {
    const onAction = vi.fn();
    renderWithProviders(
      <RecordCard
        title="Cuota 6"
        badge={<Chip label="SAC" size="small" />}
        action={<IconButton aria-label="borrar cuota 6" onClick={onAction}>x</IconButton>}
        highlights={highlights}
        details={details}
      />,
    );
    expect(within(card()).getByText("SAC")).toBeInTheDocument();
    await userEvent.click(within(card()).getByRole("button", { name: "borrar cuota 6" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
