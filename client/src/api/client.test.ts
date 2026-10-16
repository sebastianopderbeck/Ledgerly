import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch, UnauthorizedError } from "./client.js";

afterEach(() => vi.restoreAllMocks());

describe("apiFetch", () => {
  it("hace GET a /api y devuelve JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ));
    const data = await apiFetch<{ ok: boolean }>("/health");
    expect(data.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("lanza con el mensaje del backend en error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Formato no reconocido" }), { status: 422 }),
    ));
    await expect(apiFetch("/statements")).rejects.toThrow("Formato no reconocido");
  });

  it("un 401 lanza UnauthorizedError con el mensaje del backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Sesión vencida o inexistente" }), { status: 401 }),
    ));
    const error = await apiFetch("/statements").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect((error as Error).message).toBe("Sesión vencida o inexistente");
  });
});
