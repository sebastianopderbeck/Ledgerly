import { useState } from "react";
import { IconButton, MenuItem, Switch, TableCell, TextField } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { MotionTableRow } from "./motion/motion.js";
import { fadeItem } from "./motion/variants.js";

interface RuleDraft { priority: number; matchType: CategoryRuleDTO["matchType"]; pattern: string; category: string; }

interface CategoryRuleRowProps {
  rule: CategoryRuleDTO;
  onSave: (id: string, body: RuleDraft) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

export const CategoryRuleRow = ({ rule, onSave, onDelete, onToggle }: CategoryRuleRowProps) => {
  const [editing, setEditing] = useState(false);
  const [priority, setPriority] = useState(rule.priority);
  const [matchType, setMatchType] = useState<CategoryRuleDTO["matchType"]>(rule.matchType);
  const [pattern, setPattern] = useState(rule.pattern);
  const [category, setCategory] = useState(rule.category);

  const cancel = () => {
    setPriority(rule.priority);
    setMatchType(rule.matchType);
    setPattern(rule.pattern);
    setCategory(rule.category);
    setEditing(false);
  };

  const save = () => {
    onSave(rule.id, { priority: Number(priority), matchType, pattern, category });
    setEditing(false);
  };

  if (!editing) {
    return (
      <MotionTableRow variants={fadeItem}>
        <TableCell>{rule.priority}</TableCell>
        <TableCell>{rule.matchType}</TableCell>
        <TableCell>{rule.pattern}</TableCell>
        <TableCell>{rule.category}</TableCell>
        <TableCell><Switch checked={rule.enabled} onChange={(e) => onToggle(rule.id, e.target.checked)} /></TableCell>
        <TableCell>
          <IconButton aria-label="editar" onClick={() => setEditing(true)}><EditIcon /></IconButton>
          <IconButton aria-label="borrar" onClick={() => onDelete(rule.id)}><DeleteIcon /></IconButton>
        </TableCell>
      </MotionTableRow>
    );
  }

  return (
    <MotionTableRow variants={fadeItem}>
      <TableCell>
        <TextField type="number" size="small" sx={{ width: 80 }} label="Prioridad"
          value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
      </TableCell>
      <TableCell>
        <TextField select size="small" sx={{ minWidth: 110 }} label="Tipo"
          value={matchType} onChange={(e) => setMatchType(e.target.value as CategoryRuleDTO["matchType"])}>
          <MenuItem value="contains">contains</MenuItem>
          <MenuItem value="regex">regex</MenuItem>
        </TextField>
      </TableCell>
      <TableCell>
        <TextField size="small" label="Patrón" value={pattern} onChange={(e) => setPattern(e.target.value)} />
      </TableCell>
      <TableCell>
        <TextField size="small" label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} />
      </TableCell>
      <TableCell><Switch checked={rule.enabled} onChange={(e) => onToggle(rule.id, e.target.checked)} /></TableCell>
      <TableCell>
        <IconButton aria-label="guardar" onClick={save}><CheckIcon /></IconButton>
        <IconButton aria-label="cancelar" onClick={cancel}><CloseIcon /></IconButton>
      </TableCell>
    </MotionTableRow>
  );
};
