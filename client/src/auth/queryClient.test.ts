import { describe, it, expect } from "vitest";
import { MutationObserver } from "@tanstack/react-query";
import type { MeDTO } from "@ledgerly/shared";
import { UnauthorizedError } from "../api/client.js";
import { createAppQueryClient } from "./queryClient.js";
import { ME_QUERY_KEY } from "./useMe.js";

const OWNER_ME: MeDTO = { email: "owner@test.dev", name: "Owner", isOwner: true };

const failingQuery = (error: Error) => () => Promise.reject(error);

describe("createAppQueryClient", () => {
  it("un 401 en una query deja la sesión en null", async () => {
    const client = createAppQueryClient();
    client.setQueryData(ME_QUERY_KEY, OWNER_ME);
    await client.fetchQuery({ queryKey: ["resumenes"], queryFn: failingQuery(new UnauthorizedError("x")) }).catch(() => undefined);
    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it("un 401 en una mutation deja la sesión en null", async () => {
    const client = createAppQueryClient();
    client.setQueryData(ME_QUERY_KEY, OWNER_ME);
    const observer = new MutationObserver(client, { mutationFn: failingQuery(new UnauthorizedError("x")) });
    await observer.mutate().catch(() => undefined);
    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it("otro error no toca la sesión", async () => {
    const client = createAppQueryClient();
    client.setQueryData(ME_QUERY_KEY, OWNER_ME);
    await client.fetchQuery({ queryKey: ["resumenes"], queryFn: failingQuery(new Error("Mongo caído")) }).catch(() => undefined);
    expect(client.getQueryData(ME_QUERY_KEY)).toEqual(OWNER_ME);
  });
});
