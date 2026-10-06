import { useId, useState, type MouseEvent } from "react";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import EventRepeatOutlinedIcon from "@mui/icons-material/EventRepeatOutlined";
import { cadenciaSchema, type Cadencia } from "@ledgerly/shared";
import { CADENCE_LABELS, cadenceMenuLabel, cadenceMenuTooltip } from "../subscriptions.js";

interface CadenceMenuProps {
  nombre: string;
  cadencia: Cadencia;
  onChange: (cadencia: Cadencia) => void;
  iconSize?: "small" | "medium";
  buttonSx?: SxProps<Theme>;
}

export const CadenceMenu = ({ nombre, cadencia, onChange, iconSize = "medium", buttonSx }: CadenceMenuProps) => {
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const isOpen = anchor !== null;
  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const close = () => setAnchor(null);
  const choose = (option: Cadencia) => {
    close();
    if (option !== cadencia) onChange(option);
  };
  const options = cadenciaSchema.options.map((option) => (
    <MenuItem key={option} selected={option === cadencia} onClick={() => choose(option)}>
      {CADENCE_LABELS[option]}
    </MenuItem>
  ));

  return (
    <>
      <Tooltip title={cadenceMenuTooltip(cadencia)} describeChild>
        <IconButton
          aria-label={cadenceMenuLabel(nombre)}
          aria-haspopup="menu"
          aria-controls={isOpen ? menuId : undefined}
          aria-expanded={isOpen}
          onClick={open}
          sx={buttonSx}
        >
          <EventRepeatOutlinedIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>
      <Menu id={menuId} anchorEl={anchor} open={isOpen} onClose={close}>
        {options}
      </Menu>
    </>
  );
};
