import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MeDTO } from "@ledgerly/shared";
import { createAppQueryClient } from "../../auth/queryClient.js";
import { renderWithProviders } from "../../testing/renderWithProviders.js";
import { AuthGate } from "../auth/AuthGate.js";
import { UserMenu } from "./UserMenu.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubMe = (me: MeDTO) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/auth/logout") && init?.method === "POST") return new Response(null, { status: 204 });
    return respond(me);
  }));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("muestra la inicial del nombre y, al abrirlo, el mail y Salir", async () => {
    stubMe(OWNER_ME);
    renderWithProviders(<UserMenu />);
    const button = await screen.findByRole("button", { name: "tu cuenta" });
    expect(button).toHaveTextContent("O");
    await userEvent.click(button);
    expect(screen.getByText("owner@test.dev")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Salir" })).toBeInTheDocument();
  });

  it("sin nombre usa la inicial del mail", async () => {
    stubMe({ email: "beto@test.dev", name: "  ", isOwner: false });
    renderWithProviders(<UserMenu />);
    expect(await screen.findByRole("button", { name: "tu cuenta" })).toHaveTextContent("B");
  });

  it("Salir cierra la sesión, limpia la caché y vuelve al login", async () => {
    stubMe(OWNER_ME);
    const client = createAppQueryClient();
    client.setQueryData(["statements"], [{ id: "s1" }]);
    renderWithProviders(<AuthGate><UserMenu /></AuthGate>, { client });
    await userEvent.click(await screen.findByRole("button", { name: "tu cuenta" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Salir" }));
    expect(await screen.findByRole("link", { name: "Entrar con Google" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(client.getQueryData(["statements"])).toBeUndefined();
  });
});
