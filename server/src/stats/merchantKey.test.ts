import { describe, it, expect } from "vitest";
import {
  canonicalMerchantKeys,
  merchantDisplayName,
  merchantKey,
  merchantMatchKey,
  merchantSearchTerm,
  merchantWords,
} from "./merchantKey.js";

describe("merchantWords", () => {
  it("pasa a mayúsculas sin tildes, separa la puntuación y descarta IDs y USD", () => {
    expect(merchantWords("Café Martínez 12")).toEqual(["CAFE", "MARTINEZ"]);
    expect(merchantWords("APPCLOUD.COM/BILL MLV4JWFSG")).toEqual(["APPCLOUD", "COM", "BILL"]);
    expect(merchantWords("SERVICIO EXTERIOR USD 14,99")).toEqual(["SERVICIO", "EXTERIOR"]);
    expect(merchantWords("123456")).toEqual([]);
  });
});

describe("merchantKey", () => {
  it("descarta el ID numérico o alfanumérico del final", () => {
    expect(merchantKey("STREAMFLIX.COM 58141049416586488")).toBe("STREAMFLIX COM");
    expect(merchantKey("STREAMFLIX.COM ydnBWjd7S")).toBe("STREAMFLIX COM");
  });

  it("descarta el comprobante pegado adelante", () => {
    expect(merchantKey("081419Q STREAMFLIX.COM LYXdQ0WEI5")).toBe("STREAMFLIX COM");
  });

  it("no distingue puntuación ni mayúsculas", () => {
    expect(merchantKey("Streamflix com")).toBe("STREAMFLIX COM");
    expect(merchantKey("APPCLOUD.COM/BILL")).toBe(merchantKey("APPCLOUD.COM BILL MLV4JWFSG"));
  });

  it("se queda con las dos primeras palabras", () => {
    expect(merchantKey("GOOGLE *VideoP X1y2Z3")).toBe("GOOGLE VIDEOP");
    expect(merchantKey("PEDIDOSYA PLUS")).not.toBe(merchantKey("PEDIDOSYA PROPINA"));
    expect(merchantKey("CAFÉ MARTÍNEZ 12")).toBe("CAFE MARTINEZ");
  });

  it("si no queda ninguna palabra devuelve vacío", () => {
    expect(merchantKey("123456")).toBe("");
  });
});

describe("merchantMatchKey", () => {
  it("compara comercios con códigos variables por todas sus palabras", () => {
    expect(merchantMatchKey("SPOTIFY P1A2B3")).toBe("SPOTIFY");
    expect(merchantMatchKey("SPOTIFY P1")).toBe(merchantMatchKey("SPOTIFY X9"));
    expect(merchantMatchKey("Café Martínez")).toBe("CAFE MARTINEZ");
    expect(merchantMatchKey("UBER *TRIP")).toBe("UBER TRIP");
    expect(merchantMatchKey("LA PANADERIA DE PEPE")).toBe("LA PANADERIA DE PEPE");
  });

  it("si no queda ninguna palabra usa el comercio entero y es idempotente", () => {
    expect(merchantMatchKey(" 123456 ")).toBe("123456");
    expect(merchantMatchKey(merchantMatchKey("Uber *Trip"))).toBe("UBER TRIP");
  });
});

describe("canonicalMerchantKeys", () => {
  it("fusiona una clave truncada con la completa, hacia la más corta", () => {
    const mapping = canonicalMerchantKeys(["GOOGLE VIDEOPREMIUM", "GOOGLE VIDEOP", "STREAMFLIX COM"]);
    expect(mapping.get("GOOGLE VIDEOPREMIUM")).toBe("GOOGLE VIDEOP");
    expect(mapping.get("GOOGLE VIDEOP")).toBe("GOOGLE VIDEOP");
    expect(mapping.get("STREAMFLIX COM")).toBe("STREAMFLIX COM");
  });

  it("no fusiona claves con distinta cantidad de palabras", () => {
    const mapping = canonicalMerchantKeys(["PEDIDOSYA", "PEDIDOSYA PLUS"]);
    expect(mapping.get("PEDIDOSYA PLUS")).toBe("PEDIDOSYA PLUS");
  });

  it("no fusiona con un prefijo de menos de 4 letras", () => {
    const mapping = canonicalMerchantKeys(["DIA", "DIAMANTE"]);
    expect(mapping.get("DIAMANTE")).toBe("DIAMANTE");
  });

  it("no fusiona si difiere una palabra que no es la última", () => {
    const mapping = canonicalMerchantKeys(["CAFE MART", "TE MARTINEZ"]);
    expect(mapping.get("TE MARTINEZ")).toBe("TE MARTINEZ");
  });
});

describe("merchantDisplayName", () => {
  it("saca las palabras con dígitos", () => {
    expect(merchantDisplayName("STREAMFLIX.COM 677290205")).toBe("STREAMFLIX.COM");
    expect(merchantDisplayName("PLAN AUTOAHORRO-X 3684097")).toBe("PLAN AUTOAHORRO-X");
  });

  it("si no queda nada devuelve el comercio original", () => {
    expect(merchantDisplayName("123456")).toBe("123456");
  });
});

describe("merchantSearchTerm", () => {
  it("usa el prefijo común sin distinguir mayúsculas, con la grafía del primero", () => {
    expect(merchantSearchTerm(["STREAMFLIX.COM 1234567", "Streamflix com"])).toBe("STREAMFLIX");
    expect(merchantSearchTerm(["GOOGLE *VideoP X1y2Z3", "GOOGLE *VideoPremium"])).toBe("GOOGLE *VideoP");
  });

  it("saca el comprobante inicial y los separadores finales", () => {
    expect(merchantSearchTerm(["081419Q STREAMFLIX.COM A1", "STREAMFLIX.COM B2"])).toBe("STREAMFLIX.COM");
  });

  it("con un prefijo de menos de 3 caracteres usa el nombre del primero", () => {
    expect(merchantSearchTerm(["AB 123", "AC 456"])).toBe("AB");
    expect(merchantSearchTerm(["STREAMFLIX.COM 677290205", "MUSICAPP"])).toBe("STREAMFLIX.COM");
  });

  it("sin comercios devuelve vacío", () => {
    expect(merchantSearchTerm([])).toBe("");
  });
});
