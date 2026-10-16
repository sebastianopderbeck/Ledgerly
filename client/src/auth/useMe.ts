import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { meDtoSchema, type MeDTO } from "@ledgerly/shared";
import { apiFetch, UnauthorizedError } from "../api/client.js";

export const ME_QUERY_KEY = ["me"] as const;
export const GOOGLE_LOGIN_URL = "/api/auth/google";

const fetchMe = async (): Promise<MeDTO | null> => {
  try {
    return meDtoSchema.parse(await apiFetch<unknown>("/auth/me"));
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  }
};

export const useMe = (): UseQueryResult<MeDTO | null, Error> =>
  useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, staleTime: Infinity });

export const useLogout = (): UseMutationResult<void, Error, void> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.removeQueries({ predicate: ({ queryKey }) => queryKey[0] !== ME_QUERY_KEY[0] });
      queryClient.getMutationCache().clear();
    },
  });
};
