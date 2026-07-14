import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ColorModeProvider, useColorModeState } from "./theme.js";
import { Layout } from "./components/Layout.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ImportPage } from "./pages/ImportPage.js";
import { TransactionsPage } from "./pages/TransactionsPage.js";
import { RulesPage } from "./pages/RulesPage.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export const App = () => {
  const colorMode = useColorModeState();
  return (
    <ColorModeProvider value={colorMode}>
      <ThemeProvider theme={colorMode.theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/rules" element={<RulesPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ColorModeProvider>
  );
};
