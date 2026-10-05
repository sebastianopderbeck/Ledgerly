import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { ColorModeProvider, useColorModeState } from "./theme.js";
import { useThemeColorMeta } from "./useThemeColorMeta.js";
import { Layout } from "./components/layout/Layout.js";
import { PageTransition } from "./components/motion/PageTransition.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ImportPage } from "./pages/ImportPage.js";
import { TransactionsPage } from "./pages/TransactionsPage.js";
import { InstallmentsPage } from "./pages/InstallmentsPage.js";
import { RulesPage } from "./pages/RulesPage.js";
import { CreditsPage } from "./pages/CreditsPage.js";
import { AutoPage } from "./pages/AutoPage.js";
import { PayslipsPage } from "./pages/PayslipsPage.js";
import { MacroPage } from "./pages/MacroPage.js";
import { CashFlowPage } from "./pages/CashFlowPage.js";
import { BudgetsPage } from "./pages/BudgetsPage.js";
import { SubscriptionsPage } from "./pages/SubscriptionsPage.js";
import { NetWorthPage } from "./pages/NetWorthPage.js";
import { VencimientosPage } from "./pages/VencimientosPage.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><DashboardPage /></PageTransition>} />
        <Route path="/rules" element={<PageTransition><RulesPage /></PageTransition>} />
        <Route path="/import" element={<PageTransition><ImportPage /></PageTransition>} />
        <Route path="/credits" element={<PageTransition><CreditsPage /></PageTransition>} />
        <Route path="/auto" element={<PageTransition><AutoPage /></PageTransition>} />
        <Route path="/sueldo" element={<PageTransition><PayslipsPage /></PageTransition>} />
        <Route path="/patrimonio" element={<PageTransition><NetWorthPage /></PageTransition>} />
        <Route path="/vencimientos" element={<PageTransition><VencimientosPage /></PageTransition>} />
        <Route path="/contexto" element={<PageTransition><MacroPage /></PageTransition>} />
        <Route path="/flujo" element={<PageTransition><CashFlowPage /></PageTransition>} />
        <Route path="/presupuestos" element={<PageTransition><BudgetsPage /></PageTransition>} />
        <Route path="/transactions" element={<PageTransition><TransactionsPage /></PageTransition>} />
        <Route path="/suscripciones" element={<PageTransition><SubscriptionsPage /></PageTransition>} />
        <Route path="/installments" element={<PageTransition><InstallmentsPage /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
};

export const App = () => {
  const colorMode = useColorModeState();
  useThemeColorMeta(colorMode.theme.palette.background.default);
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
