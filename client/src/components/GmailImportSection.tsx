import { Alert, AlertTitle, Box, Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import type { GmailStatusDTO } from "@ledgerly/shared";
import { useGmailStatus, useGmailSync } from "../api/hooks.js";
import { gmailIntervalLabel, gmailLastRunLabel, gmailMissingVarsMessage } from "../gmailImport.js";
import { useIsMobile } from "../useIsMobile.js";
import { GmailSyncResult } from "./GmailSyncResult.js";
import { tapTargetSx } from "./tapTarget.js";

interface GmailDisabledNoticeProps {
  missing: string[];
}

interface GmailSyncCardProps {
  status: GmailStatusDTO;
}

const cardContentSx: SxProps<Theme> = { p: 2, "&:last-child": { pb: 2 } };
const headerSx: SxProps<Theme> = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2,
};
const textsSx: SxProps<Theme> = { flex: "1 1 240px", minWidth: 0 };

const GmailDisabledNotice = ({ missing }: GmailDisabledNoticeProps) => (
  <Alert severity="info">
    <AlertTitle>Importación desde Gmail deshabilitada</AlertTitle>
    {gmailMissingVarsMessage(missing)}
  </Alert>
);

const GmailSyncCard = ({ status }: GmailSyncCardProps) => {
  const isMobile = useIsMobile();
  const sync = useGmailSync();
  const run = sync.data ?? status.lastRun;
  const handleSync = () => sync.mutate();
  const buttonLabel = sync.isPending ? "Buscando…" : "Buscar en Gmail";
  const buttonIcon = sync.isPending ? <CircularProgress size={16} color="inherit" /> : <MailOutlineIcon />;
  const intervalText = `Búsqueda automática: ${gmailIntervalLabel(status.intervalMinutes)}`;
  const queryText = `Consulta: ${status.query ?? ""}`;

  return (
    <Card variant="outlined">
      <CardContent sx={cardContentSx}>
        <Box sx={headerSx}>
          <Box sx={textsSx}>
            <Typography variant="body1">{gmailLastRunLabel(run)}</Typography>
            <Typography variant="body2" color="text.secondary">{intervalText}</Typography>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {queryText}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={buttonIcon}
            onClick={handleSync}
            disabled={sync.isPending}
            fullWidth={isMobile}
            sx={isMobile ? tapTargetSx : undefined}
          >
            {buttonLabel}
          </Button>
        </Box>
        {sync.isError && <Alert severity="error" sx={{ mt: 2 }}>{sync.error.message}</Alert>}
        {run && <GmailSyncResult run={run} />}
      </CardContent>
    </Card>
  );
};

const GmailImportPanel = () => {
  const { data: status, isLoading, isError, error } = useGmailStatus();

  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;
  if (!status) return null;
  if (!status.enabled) return <GmailDisabledNotice missing={status.missing} />;
  return <GmailSyncCard status={status} />;
};

export const GmailImportSection = () => (
  <>
    <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Gmail</Typography>
    <GmailImportPanel />
  </>
);
