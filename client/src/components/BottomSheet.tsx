import type { ReactNode } from "react";
import { Box, SwipeableDrawer, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

const ignoreOpen = () => undefined;

const modalProps = { keepMounted: false };

const paperSx: SxProps<Theme> = {
  borderRight: 0,
  borderTop: 1,
  borderColor: "divider",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  maxHeight: "90vh",
  px: 2,
  pt: 1,
  pb: "calc(16px + env(safe-area-inset-bottom))",
};

const handleSx: SxProps<Theme> = {
  width: 36,
  height: 4,
  borderRadius: 2,
  bgcolor: "text.secondary",
  opacity: 0.4,
  mx: "auto",
  mb: 1.5,
  flexShrink: 0,
};

export const BottomSheet = ({ open, onClose, title, children, actions }: BottomSheetProps) => (
  <SwipeableDrawer
    anchor="bottom"
    open={open}
    onClose={onClose}
    onOpen={ignoreOpen}
    disableSwipeToOpen
    disableDiscovery={isIos}
    disableBackdropTransition={!isIos}
    ModalProps={modalProps}
    slotProps={{ paper: { role: "dialog", "aria-modal": true, "aria-label": title, sx: paperSx } }}
  >
    <Box aria-hidden sx={handleSx} />
    <Typography variant="h6" sx={{ mb: 2, overflowWrap: "anywhere" }}>{title}</Typography>
    <Box sx={{ overflowY: "auto" }}>{children}</Box>
    {actions && <Box sx={{ display: "flex", gap: 1, mt: 2 }}>{actions}</Box>}
  </SwipeableDrawer>
);
