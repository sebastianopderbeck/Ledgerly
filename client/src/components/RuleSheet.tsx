import { useState, type ChangeEvent } from "react";
import { Box, Button, MenuItem, TextField } from "@mui/material";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { BottomSheet } from "./BottomSheet.js";

export type MatchType = CategoryRuleDTO["matchType"];

export interface RuleDraft {
  priority: number;
  matchType: MatchType;
  pattern: string;
  category: string;
}

interface RuleSheetProps {
  open: boolean;
  rule: CategoryRuleDTO | null;
  onClose: () => void;
  onSave: (draft: RuleDraft) => void;
  onDelete: (rule: CategoryRuleDTO) => void;
}

interface RuleFormProps {
  rule: CategoryRuleDTO | null;
  onClose: () => void;
  onSave: (draft: RuleDraft) => void;
  onDelete: (rule: CategoryRuleDTO) => void;
}

export const NEW_RULE_PRIORITY = 100;

export const MATCH_TYPE_LABELS: Record<MatchType, string> = { contains: "contiene", regex: "regex" };

const MATCH_TYPES: MatchType[] = ["contains", "regex"];

const isMatchType = (value: string): value is MatchType => Object.hasOwn(MATCH_TYPE_LABELS, value);

const matchTypeOptions = MATCH_TYPES.map((type) => (
  <MenuItem key={type} value={type}>{MATCH_TYPE_LABELS[type]}</MenuItem>
));

const patternInputProps = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false, style: { fontFamily: "monospace" } };

const RuleForm = ({ rule, onClose, onSave, onDelete }: RuleFormProps) => {
  const [priority, setPriority] = useState(String(rule?.priority ?? NEW_RULE_PRIORITY));
  const [matchType, setMatchType] = useState<MatchType>(rule?.matchType ?? "contains");
  const [pattern, setPattern] = useState(rule?.pattern ?? "");
  const [category, setCategory] = useState(rule?.category ?? "");
  const parsedPriority = Number(priority);
  const valid = pattern !== "" && category !== "" && priority.trim() !== "" && Number.isFinite(parsedPriority);

  const changePriority = (event: ChangeEvent<HTMLInputElement>) => setPriority(event.target.value);
  const changeMatchType = (event: ChangeEvent<HTMLInputElement>) => {
    if (isMatchType(event.target.value)) setMatchType(event.target.value);
  };
  const changePattern = (event: ChangeEvent<HTMLInputElement>) => setPattern(event.target.value);
  const changeCategory = (event: ChangeEvent<HTMLInputElement>) => setCategory(event.target.value);

  const save = () => {
    if (!valid) return;
    onSave({ priority: parsedPriority, matchType, pattern, category });
    onClose();
  };

  const priorityField = rule && (
    <TextField
      label="Prioridad"
      value={priority}
      onChange={changePriority}
      fullWidth
      slotProps={{ htmlInput: { inputMode: "numeric" } }}
    />
  );
  const deleteButton = rule && <Button fullWidth color="error" onClick={() => onDelete(rule)}>Borrar</Button>;

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      {priorityField}
      <TextField select label="Tipo" value={matchType} onChange={changeMatchType} fullWidth>
        {matchTypeOptions}
      </TextField>
      <TextField label="Patrón" value={pattern} onChange={changePattern} fullWidth slotProps={{ htmlInput: patternInputProps }} />
      <TextField label="Categoría" value={category} onChange={changeCategory} fullWidth />
      <Box sx={{ display: "flex", gap: 1 }}>
        {deleteButton}
        <Button fullWidth variant="contained" disabled={!valid} onClick={save}>Guardar</Button>
      </Box>
    </Box>
  );
};

export const RuleSheet = ({ open, rule, onClose, onSave, onDelete }: RuleSheetProps) => {
  const title = rule ? "Editar regla" : "Nueva regla";
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <RuleForm key={rule?.id ?? "nueva"} rule={rule} onClose={onClose} onSave={onSave} onDelete={onDelete} />
    </BottomSheet>
  );
};
