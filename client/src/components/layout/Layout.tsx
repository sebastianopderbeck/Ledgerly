import type { ReactNode } from "react";
import { Box, Container } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useIsMobile } from "../../useIsMobile.js";
import { DesktopSidebar } from "./DesktopSidebar.js";
import { MOBILE_NAV_HEIGHT, MobileBottomNav } from "./MobileBottomNav.js";
import { TopActionsPill } from "./TopActionsPill.js";
import { useSidebarCollapsed } from "./useSidebarCollapsed.js";

interface LayoutProps { children: ReactNode; }

const containerSx: SxProps<Theme> = {
  pt: { xs: "calc(72px + env(safe-area-inset-top))", md: 10 },
  pb: { xs: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 24px)`, md: 4 },
};

const statusBarScrimSx: SxProps<Theme> = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "env(safe-area-inset-top)",
  bgcolor: "background.default",
  zIndex: (theme) => theme.zIndex.appBar,
};

export const Layout = ({ children }: LayoutProps) => {
  const isMobile = useIsMobile();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <DesktopSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />}
      {isMobile && <Box aria-hidden sx={statusBarScrimSx} />}
      <TopActionsPill />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
        <Container maxWidth="lg" sx={containerSx}>{children}</Container>
      </Box>
      {isMobile && <MobileBottomNav />}
    </Box>
  );
};
