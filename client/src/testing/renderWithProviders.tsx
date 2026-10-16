import { useState, type ReactElement, type ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ColorModeProvider, useColorModeState } from "../theme.js";

interface ProvidersProps {
  children: ReactNode;
  route: string;
  queryClient?: QueryClient;
}

const Providers = ({ children, route, queryClient }: ProvidersProps) => {
  const colorMode = useColorModeState();
  const [client] = useState(() => queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } }));
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

interface RenderOptions {
  route?: string;
  client?: QueryClient;
}

export function renderWithProviders(ui: ReactElement, { route = "/", client }: RenderOptions = {}): RenderResult {
  return render(<Providers route={route} queryClient={client}>{ui}</Providers>);
}
