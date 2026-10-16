import { useState, type MouseEvent } from "react";
import { Avatar, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useLogout, useMe } from "../../auth/useMe.js";

const initialOf = (name: string, email: string): string => (name.trim() || email).charAt(0).toUpperCase();

export const UserMenu = () => {
  const { data: me } = useMe();
  const logout = useLogout();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!me) return null;

  const open = (event: MouseEvent<HTMLElement>): void => setAnchor(event.currentTarget);
  const close = (): void => setAnchor(null);
  const exit = (): void => {
    close();
    logout.mutate();
  };

  return (
    <>
      <Tooltip title="Tu cuenta">
        <IconButton color="inherit" aria-label="tu cuenta" onClick={open}>
          <Avatar sx={{ width: 28, height: 28, fontSize: 14 }}>{initialOf(me.name, me.email)}</Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={close}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>{me.email}</Typography>
        <MenuItem onClick={exit}>Salir</MenuItem>
      </Menu>
    </>
  );
};
