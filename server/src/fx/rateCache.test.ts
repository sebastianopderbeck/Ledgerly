import { describe, it, expect, vi } from "vitest";
import { createRateResolver } from "./rateCache.js";

describe("createRateResolver", () => {
  it("pide la cotización una sola vez por fecha repetida", async () => {
    const fetchRate = vi.fn().mockResolvedValue(1200);
    const resolve = createRateResolver(fetchRate);

    expect(await resolve("2025-03-10")).toBe(1200);
    expect(await resolve("2025-03-10")).toBe(1200);

    expect(fetchRate).toHaveBeenCalledTimes(1);
  });

  it("pide una vez por cada fecha distinta", async () => {
    const fetchRate = vi.fn().mockResolvedValueOnce(1200).mockResolvedValueOnce(1350);
    const resolve = createRateResolver(fetchRate);

    expect(await resolve("2025-03-10")).toBe(1200);
    expect(await resolve("2025-04-10")).toBe(1350);

    expect(fetchRate).toHaveBeenCalledTimes(2);
  });

  it("cachea el null para no reintentar una fecha sin dato", async () => {
    const fetchRate = vi.fn().mockResolvedValue(null);
    const resolve = createRateResolver(fetchRate);

    expect(await resolve("2025-03-10")).toBeNull();
    expect(await resolve("2025-03-10")).toBeNull();

    expect(fetchRate).toHaveBeenCalledTimes(1);
  });

  it("devuelve null y cachea cuando la fuente falla", async () => {
    const fetchRate = vi.fn().mockRejectedValue(new Error("red caída"));
    const resolve = createRateResolver(fetchRate);

    expect(await resolve("2025-03-10")).toBeNull();
    expect(await resolve("2025-03-10")).toBeNull();

    expect(fetchRate).toHaveBeenCalledTimes(1);
  });
});
