import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AppBar, Box, Button, Container, IconButton, Toolbar, Typography } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import { useColorMode } from "../theme.js";

interface LayoutProps { children: ReactNode; }

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/installments", label: "Cuotas" },
  { to: "/credits", label: "Créditos" },
  { to: "/transactions", label: "Movimientos" },
  { to: "/rules", label: "Reglas" },
  { to: "/import", label: "Importar" },
];

export const Layout = ({ children }: LayoutProps) => {
  const { mode, toggle } = useColorMode();
  return (
    <>
      <AppBar position="sticky" sx={{ top: 0 }}>
        <Toolbar sx={{ gap: { xs: 1, sm: 2 } }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mr: { xs: 1, sm: 3 } }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                display: "grid",
                placeItems: "center",
                color: "primary.contrastText",
                background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.dark})`,
                boxShadow: (theme) => `0 6px 18px -8px ${theme.palette.primary.main}`,
              }}
            >
              <AutoGraphIcon fontSize="small" />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                letterSpacing: "-0.02em",
                background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.light}, ${theme.palette.secondary.main})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Ledgerly
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 0.5, flexGrow: 1, overflowX: "auto" }}>
            {NAV.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.to === "/"}
                sx={{
                  color: "text.secondary",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                  "&.active": {
                    color: "primary.main",
                    fontWeight: 600,
                    bgcolor: (theme) => `${theme.palette.primary.main}1f`,
                  },
                }}
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
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>{children}</Container>
    </>
  );
};
