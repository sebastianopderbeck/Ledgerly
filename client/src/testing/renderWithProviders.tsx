import type { ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ColorModeProvider, useColorModeState } from "../theme.js";

const Providers = ({ children, route }: { children: ReactNode; route: string }) => {
  const colorMode = useColorModeState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <ColorModeProvider value={colorMode}>
      <ThemeProvider theme={colorMode.theme}>
        <CssBaseline />
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ColorModeProvider>
  );
};

export function renderWithProviders(ui: ReactElement, options: { route?: string } = {}): RenderResult {
  return render(<Providers route={options.route ?? "/"}>{ui}</Providers>);
}
