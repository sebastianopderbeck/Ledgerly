import { IconButton, List, ListItem, ListItemText, Chip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { StatementDTO } from "@ledgerly/shared";

interface StatementListProps { statements: StatementDTO[]; onDelete: (id: string) => void; }

export const StatementList = ({ statements, onDelete }: StatementListProps) => {
  if (statements.length === 0) return null;
  return (
    <List>
      {statements.map((s) => (
        <ListItem
          key={s.id}
          secondaryAction={
            <IconButton edge="end" aria-label="borrar" onClick={() => onDelete(s.id)}><DeleteIcon /></IconButton>
          }
        >
          <ListItemText
            primary={`${s.cardLabel} · cierre ${s.closingDate ?? "?"}`}
            secondary={`${s.transactionCount} movimientos`}
          />
          {s.needsReview && <Chip label="revisar" color="warning" size="small" sx={{ mr: 6 }} />}
        </ListItem>
      ))}
    </List>
  );
};
