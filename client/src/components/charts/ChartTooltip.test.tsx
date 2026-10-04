import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LineSliceTooltip, compactBarTooltip } from "./ChartTooltip.js";

afterEach(cleanup);

const slicePoint = (seriesId: string, seriesColor: string, yFormatted: string) => ({
  seriesId,
  seriesColor,
  data: { xFormatted: "2026-05", yFormatted },
});

describe("LineSliceTooltip", () => {
  it("con una sola serie muestra el mes y el valor, sin el nombre de la serie", () => {
    render(<LineSliceTooltip slice={{ points: [slicePoint("Gastado", "#0891b2", "$ 1.500,00")] }} />);
    expect(screen.getByText("2026-05")).toBeInTheDocument();
    expect(screen.getByText("$ 1.500,00")).toBeInTheDocument();
    expect(screen.queryByText("Gastado")).not.toBeInTheDocument();
  });

  it("con varias series nombra cada una", () => {
    render(
      <LineSliceTooltip
        slice={{ points: [slicePoint("Dólar", "#0891b2", "112"), slicePoint("UVA", "#6366f1", "130")] }}
      />,
    );
    expect(screen.getByText("Dólar")).toBeInTheDocument();
    expect(screen.getByText("UVA")).toBeInTheDocument();
    expect(screen.getByText("112")).toBeInTheDocument();
    expect(screen.getByText("130")).toBeInTheDocument();
  });
});

describe("compactBarTooltip", () => {
  it("muestra el nombre completo del comercio y el monto en una caja angosta que corta líneas", () => {
    const MerchantTooltip = compactBarTooltip({ showKey: false });
    const { container } = render(
      <MerchantTooltip id="total" indexValue="MERCADOLIBRE SUPERMERCADO" color="#6366f1" formattedValue="$ 1.500,00" />,
    );
    expect(screen.getByText("MERCADOLIBRE SUPERMERCADO")).toBeInTheDocument();
    expect(screen.getByText("$ 1.500,00")).toBeInTheDocument();
    expect(screen.queryByText("total")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({ width: "max-content", maxWidth: "220px", whiteSpace: "normal" });
  });

  it("con showKey nombra la serie de la barra", () => {
    const KeyTooltip = compactBarTooltip({ showKey: true });
    render(<KeyTooltip id="Neto" indexValue="2026-05" color="#34d399" formattedValue="$ 900,00" />);
    expect(screen.getByText("2026-05")).toBeInTheDocument();
    expect(screen.getByText("Neto")).toBeInTheDocument();
    expect(screen.getByText("$ 900,00")).toBeInTheDocument();
  });
});
