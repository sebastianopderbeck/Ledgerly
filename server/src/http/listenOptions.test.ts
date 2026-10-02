import { describe, it, expect } from "vitest";
import { resolveListenOptions } from "./listenOptions.js";

describe("resolveListenOptions", () => {
  it("usa el puerto 4000 y todas las interfaces si no hay variables", () => {
    expect(resolveListenOptions({})).toEqual({ port: 4000 });
  });

  it("toma PORT y HOST del entorno", () => {
    expect(resolveListenOptions({ PORT: "4100", HOST: "127.0.0.1" })).toEqual({
      port: 4100,
      host: "127.0.0.1",
    });
  });

  it("trata un HOST vacío como no definido", () => {
    expect(resolveListenOptions({ PORT: "4100", HOST: "" })).toEqual({ port: 4100 });
  });

  it("rechaza un PORT que no es un entero", () => {
    expect(() => resolveListenOptions({ PORT: "abc" })).toThrow("PORT inválido: abc");
    expect(() => resolveListenOptions({ PORT: "4100.5" })).toThrow("PORT inválido: 4100.5");
  });

  it("rechaza un PORT fuera de rango", () => {
    expect(() => resolveListenOptions({ PORT: "0" })).toThrow("PORT inválido: 0");
    expect(() => resolveListenOptions({ PORT: "70000" })).toThrow("PORT inválido: 70000");
  });
});
