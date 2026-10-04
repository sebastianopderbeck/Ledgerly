import { useCallback, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Collapse, List, ListItem, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { GmailSyncItemDTO, GmailSyncRunDTO } from "@ledgerly/shared";
import {
  GMAIL_OUTCOME_COLORS, GMAIL_OUTCOME_LABELS, gmailItemSecondary, gmailRunSummary, splitGmailItems,
} from "../gmailImport.js";
import { MIN_TAP_SIZE } from "./tapTarget.js";

interface GmailSyncResultProps {
  run: GmailSyncRunDTO;
}

interface GmailItemListProps {
  items: GmailSyncItemDTO[];
}

interface GmailItemRowProps {
  item: GmailSyncItemDTO;
}

const itemHeaderSx: SxProps<Theme> = { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1, rowGap: 0.5 };
const toggleSx: SxProps<Theme> = { ml: -1, mt: 0.5, minHeight: MIN_TAP_SIZE };

const chevronSx = (expanded: boolean): SxProps<Theme> => ({
  transform: expanded ? "rotate(180deg)" : "none",
  transition: "transform 200ms ease",
});

const GmailItemRow = ({ item }: GmailItemRowProps) => (
  <ListItem disableGutters sx={{ display: "block", py: 0.75 }}>
    <Box sx={itemHeaderSx}>
      <Typography variant="subtitle2" component="span" sx={{ overflowWrap: "anywhere", minWidth: 0 }}>
        {item.fileName}
      </Typography>
      <Chip size="small" label={GMAIL_OUTCOME_LABELS[item.outcome]} color={GMAIL_OUTCOME_COLORS[item.outcome]} />
    </Box>
    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
      {gmailItemSecondary(item)}
    </Typography>
  </ListItem>
);

const GmailItemList = ({ items }: GmailItemListProps) => {
  const rows = items.map((item) => <GmailItemRow key={item.id} item={item} />);
  return <List disablePadding>{rows}</List>;
};

export const GmailSyncResult = ({ run }: GmailSyncResultProps) => {
  const [showSkipped, setShowSkipped] = useState(false);
  const { visible, skipped } = useMemo(() => splitGmailItems(run.items), [run.items]);
  const toggleSkipped = useCallback(() => setShowSkipped((current) => !current), []);
  const summary = gmailRunSummary(run);
  const hasError = run.status === "error";
  const toggleLabel = showSkipped ? "Ocultar omitidos" : `Ver omitidos (${skipped.length})`;

  return (
    <Box sx={{ mt: 2 }}>
      {hasError && <Alert severity="error" sx={{ mb: 1.5 }}>{run.error}</Alert>}
      {summary && <Typography variant="body2" sx={{ mb: 1 }}>{summary}</Typography>}
      {run.hasMore && (
        <Alert severity="info" sx={{ mb: 1.5 }}>Quedan mails por revisar: tocá «Buscar en Gmail» otra vez.</Alert>
      )}
      {visible.length > 0 && <GmailItemList items={visible} />}
      {skipped.length > 0 && (
        <>
          <Button
            size="small"
            onClick={toggleSkipped}
            aria-expanded={showSkipped}
            endIcon={<ExpandMoreIcon sx={chevronSx(showSkipped)} />}
            sx={toggleSx}
          >
            {toggleLabel}
          </Button>
          <Collapse in={showSkipped} unmountOnExit>
            <GmailItemList items={skipped} />
          </Collapse>
        </>
      )}
    </Box>
  );
};
