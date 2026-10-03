import { act } from "@testing-library/react";

export const flushAsync = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
