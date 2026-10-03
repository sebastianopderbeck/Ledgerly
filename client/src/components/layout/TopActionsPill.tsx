import { Box, IconButton, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import MenuIcon from "@mui/icons-material/Menu";
import { useColorMode } from "../../theme.js";
import { RefreshDataButton } from "../RefreshDataButton.js";

interface TopActionsPillProps {
  showMenuButton?: boolean;
  onMenuClick?: () => void;
}

export const TopActionsPill = ({ showMenuButton = false, onMenuClick }: TopActionsPillProps) => {
  const { mode, toggle } = useColorMode();
  const themeLabel = mode === "light" ? "Modo oscuro" : "Modo claro";
  const ThemeIcon = mode === "light" ? DarkModeIcon : LightModeIcon;

  return (
    <Box
      role="group"
      aria-label="acciones rápidas"
      sx={{
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: (theme) => theme.zIndex.appBar,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        p: 0.5,
        borderRadius: 999,
        color: "text.primary",
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.55),
        border: 1,
        borderColor: "divider",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        boxShadow: (theme) => `0 12px 32px -16px ${alpha(theme.palette.common.black, 0.55)}`,
      }}
    >
      {showMenuButton && (
        <IconButton color="inherit" onClick={onMenuClick} aria-label="abrir menú">
          <MenuIcon />
        </IconButton>
      )}
      <RefreshDataButton />
      <Tooltip title={themeLabel}>
        <IconButton color="inherit" onClick={toggle} aria-label="cambiar tema">
          <ThemeIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
