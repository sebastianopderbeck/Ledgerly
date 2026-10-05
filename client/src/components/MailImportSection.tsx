import { Alert, CircularProgress, Stack, Typography } from "@mui/material";
import type { MailSourceStatusDTO } from "@ledgerly/shared";
import { useMailStatus } from "../api/hooks.js";
import { MailSourceCard } from "./MailSourceCard.js";

interface MailSourceListProps {
  statuses: MailSourceStatusDTO[];
}

const MailSourceList = ({ statuses }: MailSourceListProps) => {
  const cards = statuses.map((status) => <MailSourceCard key={status.source} status={status} />);
  return <Stack spacing={3}>{cards}</Stack>;
};

const MailImportPanel = () => {
  const { data: statuses, isLoading, isError, error } = useMailStatus();

  if (isLoading) return <CircularProgress size={24} />;
  if (isError) return <Alert severity="error">{error.message}</Alert>;
  if (!statuses) return null;
  return <MailSourceList statuses={statuses} />;
};

export const MailImportSection = () => (
  <>
    <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>Mails</Typography>
    <MailImportPanel />
  </>
);
