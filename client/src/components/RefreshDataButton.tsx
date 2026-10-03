import { useState } from "react";
import { Alert, IconButton, Snackbar, Tooltip, keyframes } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useRefreshMacro } from "../api/hooks.js";
import { refreshSummaryMessage } from "../macroRefreshSummary.js";
import { MOBILE_NAV_HEIGHT } from "./layout/MobileBottomNav.js";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const snackbarSx: SxProps<Theme> = {
  bottom: { xs: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 8px)`, md: 24 },
};

interface Feedback {
  severity: "success" | "error";
  message: string;
}

export const RefreshDataButton = () => {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const { mutate, isPending } = useRefreshMacro();

  const handleClick = () => {
    mutate(undefined, {
      onSuccess: (result) => setFeedback({ severity: "success", message: refreshSummaryMessage(result) }),
      onError: (error) => setFeedback({ severity: "error", message: error.message }),
    });
  };

  const dismiss = () => setFeedback(null);

  return (
    <>
      <Tooltip title="Actualizar dólar, UVA, tasa e inflación">
        <span>
          <IconButton color="inherit" onClick={handleClick} disabled={isPending} aria-label="actualizar datos">
            <RefreshIcon sx={{ animation: isPending ? `${spin} 1s linear infinite` : "none" }} />
          </IconButton>
        </span>
      </Tooltip>
      <Snackbar
        open={feedback !== null}
        autoHideDuration={6000}
        onClose={dismiss}
        sx={snackbarSx}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {feedback ? <Alert severity={feedback.severity} onClose={dismiss}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
};
