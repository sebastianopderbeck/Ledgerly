import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { ColorModeProvider, useColorModeState } from "./theme.js";
import { Layout } from "./components/Layout.js";
import { PageTransition } from "./components/motion/PageTransition.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ImportPage } from "./pages/ImportPage.js";
import { TransactionsPage } from "./pages/TransactionsPage.js";
import { InstallmentsPage } from "./pages/InstallmentsPage.js";
import { RulesPage } from "./pages/RulesPage.js";
import { CreditsPage } from "./pages/CreditsPage.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><DashboardPage /></PageTransition>} />
        <Route path="/import" element={<PageTransition><ImportPage /></PageTransition>} />
        <Route path="/transactions" element={<PageTransition><TransactionsPage /></PageTransition>} />
        <Route path="/installments" element={<PageTransition><InstallmentsPage /></PageTransition>} />
        <Route path="/credits" element={<PageTransition><CreditsPage /></PageTransition>} />
        <Route path="/rules" element={<PageTransition><RulesPage /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

export const App = () => {
  const colorMode = useColorModeState();
  return (
    <ColorModeProvider value={colorMode}>
      <ThemeProvider theme={colorMode.theme}>
        <CssBaseline />
        <MotionConfig reducedMotion="user">
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <Layout>
                <AnimatedRoutes />
              </Layout>
            </BrowserRouter>
          </QueryClientProvider>
        </MotionConfig>
      </ThemeProvider>
    </ColorModeProvider>
  );
};
