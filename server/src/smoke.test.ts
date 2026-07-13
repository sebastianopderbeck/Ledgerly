import { describe, it, expect } from "vitest";
import { SHARED_PACKAGE } from "@ledgerly/shared";

describe("scaffold", () => {
  it("resuelve el workspace shared", () => {
    expect(SHARED_PACKAGE).toBe("@ledgerly/shared");
  });
});
