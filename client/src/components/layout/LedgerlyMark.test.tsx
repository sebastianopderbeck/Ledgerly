import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { LedgerlyMark } from "./LedgerlyMark.js";

afterEach(cleanup);

const theme = createTheme({ palette: { primary: { main: "#123456" }, secondary: { main: "#abcdef" } } });

const renderMark = (ui = <LedgerlyMark />) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const gradientIdOf = (svg: SVGSVGElement) => svg.querySelector("linearGradient")?.getAttribute("id") ?? "";

describe("LedgerlyMark", () => {
  it("es decorativo y respeta el tamaño pedido", () => {
    const { container } = renderMark(<LedgerlyMark size={48} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "48");
    expect(svg).toHaveAttribute("height", "48");
  });

  it("usa 30px por defecto", () => {
    const { container } = renderMark();
    expect(container.querySelector("svg")).toHaveAttribute("width", "30");
  });

  it("toma el degradé de los colores primario y secundario del tema", () => {
    const { container } = renderMark();
    const stops = Array.from(container.querySelectorAll("stop")).map((stop) => stop.getAttribute("stop-color"));
    expect(stops).toEqual(["#123456", "#abcdef"]);
  });

  it("cada instancia referencia su propio degradé", () => {
    const { container } = renderMark(<><LedgerlyMark /><LedgerlyMark /></>);
    const [first, second] = Array.from(container.querySelectorAll("svg"));
    const firstId = gradientIdOf(first);
    const secondId = gradientIdOf(second);
    expect(firstId).not.toBe("");
    expect(firstId).not.toBe(secondId);
    expect(first.querySelector("path")).toHaveAttribute("stroke", `url(#${firstId})`);
    expect(second.querySelector("path")).toHaveAttribute("stroke", `url(#${secondId})`);
  });
});
