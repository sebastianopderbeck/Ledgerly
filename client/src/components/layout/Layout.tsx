import { useCallback, useState, type ReactNode } from "react";
import { Box, Container } from "@mui/material";
import { useIsMobile } from "../../useIsMobile.js";
import { DesktopSidebar } from "./DesktopSidebar.js";
import { MobileSidebar } from "./MobileSidebar.js";
import { TopActionsPill } from "./TopActionsPill.js";
import { useSidebarCollapsed } from "./useSidebarCollapsed.js";

interface LayoutProps { children: ReactNode; }

export const Layout = ({ children }: LayoutProps) => {
  const isDesktop = !useIsMobile();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMobileNav = useCallback(() => setMobileOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileOpen(false), []);

  const sidebar = isDesktop
    ? <DesktopSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
    : <MobileSidebar open={mobileOpen} onClose={closeMobileNav} />;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {sidebar}
      <TopActionsPill showMenuButton={!isDesktop} onMenuClick={openMobileNav} />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Container maxWidth="lg" sx={{ pt: 10, pb: { xs: 3, md: 4 } }}>{children}</Container>
      </Box>
    </Box>
  );
};
