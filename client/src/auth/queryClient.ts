import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { UnauthorizedError } from "../api/client.js";
import { ME_QUERY_KEY } from "./useMe.js";

export const createAppQueryClient = (): QueryClient => {
  const signOutOnUnauthorized = (error: Error): void => {
    if (error instanceof UnauthorizedError) client.setQueryData(ME_QUERY_KEY, null);
  };
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    queryCache: new QueryCache({ onError: signOutOnUnauthorized }),
    mutationCache: new MutationCache({ onError: signOutOnUnauthorized }),
  });
  return client;
};
