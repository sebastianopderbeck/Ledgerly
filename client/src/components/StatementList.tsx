import { IconButton, ListItemText, Chip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { StatementDTO } from "@ledgerly/shared";
import { MotionList, MotionListItem } from "./motion/motion.js";
import { fadeUpItem, staggerContainer } from "./motion/variants.js";

interface StatementListProps { statements: StatementDTO[]; onDelete: (id: string) => void; }

export const StatementList = ({ statements, onDelete }: StatementListProps) => {
  if (statements.length === 0) return null;
  return (
    <MotionList variants={staggerContainer} initial="hidden" animate="visible">
      {statements.map((s) => (
        <MotionListItem
          key={s.id}
          variants={fadeUpItem}
          secondaryAction={
            <IconButton edge="end" aria-label="borrar" onClick={() => onDelete(s.id)}><DeleteIcon /></IconButton>
          }
        >
          <ListItemText
            primary={`${s.cardLabel} · cierre ${s.closingDate ?? "?"}`}
            secondary={`${s.transactionCount} movimientos`}
          />
          {s.needsReview && <Chip label="revisar" color="warning" size="small" sx={{ mr: 6 }} />}
        </MotionListItem>
      ))}
    </MotionList>
  );
};
