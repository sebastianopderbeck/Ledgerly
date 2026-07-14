import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AppBar, Box, Button, Container, IconButton, Toolbar, Typography } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useColorMode } from "../theme.js";

interface LayoutProps { children: ReactNode; }

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/import", label: "Importar" },
  { to: "/transactions", label: "Movimientos" },
  { to: "/rules", label: "Reglas" },
];

export const Layout = ({ children }: LayoutProps) => {
  const { mode, toggle } = useColorMode();
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ mr: 4 }}>Ledgerly</Typography>
          <Box sx={{ display: "flex", gap: 1, flexGrow: 1 }}>
            {NAV.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.to === "/"}
                sx={{ color: "inherit", "&.active": { fontWeight: 700, textDecoration: "underline" } }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <IconButton color="inherit" onClick={toggle} aria-label="cambiar tema">
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>{children}</Container>
    </>
  );
};
