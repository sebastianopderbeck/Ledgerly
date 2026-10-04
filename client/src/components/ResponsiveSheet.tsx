import type { ReactNode } from "react";
import { Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { useIsMobile } from "../useIsMobile.js";
import { BottomSheet } from "./BottomSheet.js";

interface ResponsiveSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}

export const ResponsiveSheet = ({ open, onClose, title, children, actions }: ResponsiveSheetProps) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} actions={actions}>
        {children}
      </BottomSheet>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </Dialog>
  );
};
