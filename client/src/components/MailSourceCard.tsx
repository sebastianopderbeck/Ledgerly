import { Alert, AlertTitle, Box, Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { MAIL_SOURCE_LABELS, type MailSource, type MailSourceStatusDTO } from "@ledgerly/shared";
import { useMailSync } from "../api/hooks.js";
import {
  mailDisabledTitle, mailLastRunLabel, mailMissingMessage, mailScopeLabel, mailSearchLabel,
} from "../mailImport.js";
import { useIsMobile } from "../useIsMobile.js";
import { MailSyncResult } from "./MailSyncResult.js";
import { tapTargetSx } from "./tapTarget.js";

interface MailSourceCardProps {
  status: MailSourceStatusDTO;
}

interface MailDisabledNoticeProps {
  source: MailSource;
  missing: string[];
}

interface MailSyncCardProps {
  status: MailSourceStatusDTO;
}

const cardContentSx: SxProps<Theme> = { p: 2, "&:last-child": { pb: 2 } };
const headerSx: SxProps<Theme> = {
  display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2,
};
const textsSx: SxProps<Theme> = { flex: "1 1 240px", minWidth: 0 };

const MailDisabledNotice = ({ source, missing }: MailDisabledNoticeProps) => (
  <Alert severity="info">
    <AlertTitle>{mailDisabledTitle(source)}</AlertTitle>
    {mailMissingMessage(source, missing)}
  </Alert>
);

const MailSyncCard = ({ status }: MailSyncCardProps) => {
  const isMobile = useIsMobile();
  const sync = useMailSync(status.source);
  const run = sync.data ?? status.lastRun;
  const handleSync = () => sync.mutate();
  const buttonLabel = sync.isPending ? "Buscando…" : mailSearchLabel(status.source);
  const buttonIcon = sync.isPending ? <CircularProgress size={16} color="inherit" /> : <MailOutlineIcon />;
  const scheduleText = `Búsqueda automática: ${status.schedule ?? "apagada"}`;

  return (
    <Card variant="outlined">
      <CardContent sx={cardContentSx}>
        <Box sx={headerSx}>
          <Box sx={textsSx}>
            <Typography variant="body1">{mailLastRunLabel(status.source, run)}</Typography>
            <Typography variant="body2" color="text.secondary">{scheduleText}</Typography>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
              {mailScopeLabel(status.source, status.scope)}
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
        {run && <MailSyncResult run={run} />}
      </CardContent>
    </Card>
  );
};

export const MailSourceCard = ({ status }: MailSourceCardProps) => {
  const title = MAIL_SOURCE_LABELS[status.source];
  const body = status.enabled
    ? <MailSyncCard status={status} />
    : <MailDisabledNotice source={status.source} missing={status.missing} />;

  return (
    <Box component="section" aria-label={title}>
      <Typography variant="subtitle1" component="h3" sx={{ mb: 1 }}>{title}</Typography>
      {body}
    </Box>
  );
};
