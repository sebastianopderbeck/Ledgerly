import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import { Box, Divider, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { NAV_GROUPS } from "./navItems.js";
import { sidebarItemSx } from "./sidebarItemSx.js";
import { useNavSearch } from "./useNavSearch.js";

interface SidebarNavProps {
  collapsed?: boolean;
}

export const SidebarNav = ({ collapsed = false }: SidebarNavProps) => {
  const search = useNavSearch();

  const groups = NAV_GROUPS.map(({ id, items }, index) => (
    <Fragment key={id}>
      {index > 0 && <Divider component="li" sx={{ my: 1 }} />}
      {items.map(({ to, label, icon: Icon }) => (
        <ListItem key={to} disablePadding sx={{ mb: 0.5 }}>
          <Tooltip title={collapsed ? label : ""} placement="right">
            <ListItemButton
              component={NavLink}
              to={{ pathname: to, search }}
              end={to === "/"}
              aria-label={label}
              sx={sidebarItemSx(collapsed)}
            >
              <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
              {!collapsed && <ListItemText primary={label} />}
            </ListItemButton>
          </Tooltip>
        </ListItem>
      ))}
    </Fragment>
  ));

  return (
    <Box component="nav" aria-label="principal" sx={{ flexGrow: 1, overflowX: "hidden", overflowY: "auto", px: 1.5 }}>
      <List disablePadding>{groups}</List>
    </Box>
  );
};
