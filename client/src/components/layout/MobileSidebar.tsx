import { Drawer } from "@mui/material";
import { Brand } from "./Brand.js";
import { SidebarNav } from "./SidebarNav.js";
import { SIDEBAR_WIDTH } from "./navItems.js";

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export const MobileSidebar = ({ open, onClose }: MobileSidebarProps) => (
  <Drawer
    variant="temporary"
    open={open}
    onClose={onClose}
    sx={{ "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH.expanded, boxSizing: "border-box" } }}
  >
    <Brand />
    <SidebarNav onNavigate={onClose} />
  </Drawer>
);
