import { useState } from "react";
import { Alert, IconButton, Snackbar, Tooltip, keyframes } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useRefreshMacro } from "../api/hooks.js";
import { refreshSummaryMessage } from "../macroRefreshSummary.js";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

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
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {feedback ? <Alert severity={feedback.severity} onClose={dismiss}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </>
  );
};
