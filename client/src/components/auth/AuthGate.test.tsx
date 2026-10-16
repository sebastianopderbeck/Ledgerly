import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { apiFetch } from "../../api/client.js";
import { createAppQueryClient } from "../../auth/queryClient.js";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { AuthGate } from "./AuthGate.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };
const NO_SESSION = { error: "Sesión vencida o inexistente" };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (handler: (url: string) => Response | Promise<Response>) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => handler(url)));
};

const Probe = () => {
  const { isError } = useQuery({ queryKey: ["probe"], queryFn: () => apiFetch<unknown>("/statements") });
  const label = isError ? "falló" : "app";
  return <p>{label}</p>;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthGate", () => {
  it("mientras averigua la sesión muestra la marca cargando y no la app", () => {
    stubFetch(() => new Promise<Response>(() => undefined));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(screen.getByRole("progressbar", { name: "cargando" })).toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("sin sesión muestra el botón para entrar con Google", async () => {
    stubFetch(() => respond(NO_SESSION, 401));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(await screen.findByRole("link", { name: "Entrar con Google" })).toHaveAttribute("href", "/api/auth/google");
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("con sesión muestra la app", async () => {
    stubFetch(() => respond(OWNER_ME));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(await screen.findByText("app")).toBeInTheDocument();
  });

  it.each([
    ["no-autorizado", "Ese mail no tiene acceso a Ledgerly"],
    ["login-fallido", "No se pudo entrar con Google. Probá de nuevo"],
  ])("con ?error=%s avisa «%s»", async (code, message) => {
    stubFetch(() => respond(NO_SESSION, 401));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>, { route: `/?error=${code}` });
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("si /auth/me falla muestra el error", async () => {
    stubFetch(() => respond({ error: "Mongo caído" }, 500));
    renderWithProviders(<AuthGate><p>app</p></AuthGate>);
    expect(await screen.findByText("Mongo caído")).toBeInTheDocument();
  });

  it("un 401 en medio de la app vuelve al login", async () => {
    stubFetch((url) => (url.endsWith("/auth/me") ? respond(OWNER_ME) : respond(NO_SESSION, 401)));
    renderWithProviders(<AuthGate><Probe /></AuthGate>, { client: createAppQueryClient() });
    expect(await screen.findByRole("link", { name: "Entrar con Google" })).toBeInTheDocument();
  });
});
