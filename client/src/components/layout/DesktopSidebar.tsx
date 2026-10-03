import { Box, Drawer, ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import { Brand } from "./Brand.js";
import { SidebarNav } from "./SidebarNav.js";
import { SIDEBAR_WIDTH } from "./navItems.js";
import { sidebarItemSx } from "./sidebarItemSx.js";

interface DesktopSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const widthTransition = (theme: Theme) =>
  theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  });

export const DesktopSidebar = ({ collapsed, onToggleCollapsed }: DesktopSidebarProps) => {
  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
  const toggleLabel = collapsed ? "expandir menú" : "colapsar menú";
  const ToggleIcon = collapsed ? KeyboardDoubleArrowRightIcon : KeyboardDoubleArrowLeftIcon;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: widthTransition,
        "& .MuiDrawer-paper": { width, transition: widthTransition, overflowX: "hidden", boxSizing: "border-box" },
      }}
    >
      <Brand compact={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <Box sx={{ px: 1.5, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Tooltip title={collapsed ? "Expandir menú" : ""} placement="right">
          <ListItemButton onClick={onToggleCollapsed} aria-label={toggleLabel} sx={sidebarItemSx(collapsed)}>
            <ListItemIcon><ToggleIcon fontSize="small" /></ListItemIcon>
            {!collapsed && <ListItemText primary="Colapsar" />}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
};
