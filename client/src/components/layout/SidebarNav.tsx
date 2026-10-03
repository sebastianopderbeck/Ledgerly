import { NavLink } from "react-router-dom";
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { NAV_ITEMS } from "./navItems.js";
import { sidebarItemSx } from "./sidebarItemSx.js";
import { useNavSearch } from "./useNavSearch.js";

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export const SidebarNav = ({ collapsed = false, onNavigate }: SidebarNavProps) => {
  const search = useNavSearch();

  return (
    <Box component="nav" aria-label="principal" sx={{ flexGrow: 1, overflowX: "hidden", overflowY: "auto", px: 1.5 }}>
      <List disablePadding>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <ListItem key={to} disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={collapsed ? label : ""} placement="right">
              <ListItemButton
                component={NavLink}
                to={{ pathname: to, search }}
                end={to === "/"}
                aria-label={label}
                onClick={onNavigate}
                sx={sidebarItemSx(collapsed)}
              >
                <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
                {!collapsed && <ListItemText primary={label} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};
