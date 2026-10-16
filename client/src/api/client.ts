export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isForm ? init.headers : { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const message = body?.error ?? `Error ${res.status}`;
    throw res.status === 401 ? new UnauthorizedError(message) : new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
