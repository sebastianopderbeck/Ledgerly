import { describe, it, expect, vi } from "vitest";
import { createConnector } from "./serverlessConnection.js";

const URL = "mongodb://sintetico/ledgerly";

describe("createConnector", () => {
  it("conecta una sola vez aunque lo llamen varias veces", async () => {
    const connect = vi.fn(async () => undefined);
    const connectOnce = createConnector(connect);
    await connectOnce(URL);
    await connectOnce(URL);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(URL);
  });

  it("dos llamadas simultáneas comparten la misma conexión", async () => {
    const connect = vi.fn(async () => undefined);
    const connectOnce = createConnector(connect);
    await Promise.all([connectOnce(URL), connectOnce(URL)]);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("si falla, la próxima llamada reintenta", async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Atlas no responde"))
      .mockResolvedValueOnce(undefined);
    const connectOnce = createConnector(connect);
    await expect(connectOnce(URL)).rejects.toThrow("Atlas no responde");
    await expect(connectOnce(URL)).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
