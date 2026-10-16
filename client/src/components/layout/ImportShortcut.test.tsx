import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { ME_QUERY_KEY } from "../../auth/useMe.js";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { ImportShortcut } from "./ImportShortcut.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const clientWith = (me: MeDTO): QueryClient => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY_KEY, me);
  return client;
};

const stubNotice = (pending: boolean) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ pending }), { status: 200, headers: { "Content-Type": "application/json" } })));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImportShortcut", () => {
  it("con novedades el owner ve el punto y el aviso en el nombre", async () => {
    stubNotice(true);
    renderWithProviders(<ImportShortcut />, { client: clientWith(OWNER_ME) });
    expect(await screen.findByRole("link", { name: "importar, hay novedades de mails" })).toBeInTheDocument();
  });

  it("sin novedades es el ícono de siempre", async () => {
    stubNotice(false);
    renderWithProviders(<ImportShortcut />, { client: clientWith(OWNER_ME) });
    expect(await screen.findByRole("link", { name: "importar" })).toBeInTheDocument();
  });

  it("a quien no es owner ni le consulta el aviso", () => {
    stubNotice(true);
    renderWithProviders(<ImportShortcut />, { client: clientWith({ ...OWNER_ME, isOwner: false }) });
    expect(screen.getByRole("link", { name: "importar" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
