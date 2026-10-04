import { Link as RouterLink } from "react-router-dom";
import { Box, Button, TextField, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { groupTotalLabel, inboxTransactionsHref } from "../uncategorizedInbox.js";
import { BottomSheet } from "./BottomSheet.js";
import { RecordFields, type RecordField } from "./RecordCard.js";
import { patternInputProps } from "./RuleSheet.js";
import { tapTargetSx } from "./tapTarget.js";
import type { CreateInboxRule } from "./useInboxSection.js";
import { useInboxRuleDraft } from "./useInboxRuleDraft.js";

interface InboxRuleSheetProps {
  open: boolean;
  group: UncategorizedGroupDTO | null;
  groups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onClose: () => void;
  onCreate: CreateInboxRule;
}

interface InboxRuleFormProps {
  group: UncategorizedGroupDTO;
  groups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onClose: () => void;
  onCreate: CreateInboxRule;
}

const categoryGridSx: SxProps<Theme> = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 };

const groupFields = (group: UncategorizedGroupDTO): RecordField[] => {
  const fields: RecordField[] = [
    { label: "Movimientos", value: group.count },
    { label: "Total", value: groupTotalLabel(group) },
    { label: "Último", value: group.lastDate },
  ];
  if (group.merchants.length > 1) fields.push({ label: "Variantes", value: group.merchants.join(" · ") });
  return fields;
};

const InboxRuleForm = ({ group, groups, categories, creating, onClose, onCreate }: InboxRuleFormProps) => {
  const { pattern, changePattern, category, changeCategory, check, draft } = useInboxRuleDraft(group, groups);
  const create = () => {
    if (draft) onCreate(draft, onClose);
  };
  const categoryButtons = categories.map((name) => {
    const selected = name === category;
    return (
      <Button
        key={name}
        variant={selected ? "contained" : "outlined"}
        aria-pressed={selected}
        onClick={() => changeCategory(name)}
        sx={tapTargetSx}
      >
        {name}
      </Button>
    );
  });
  const categoryPicker = categories.length > 0 ? (
    <Box sx={categoryGridSx}>{categoryButtons}</Box>
  ) : (
    <Typography variant="body2" color="text.secondary">Todavía no hay categorías. Creá una desde «Nueva regla».</Typography>
  );

  return (
    <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
      <RecordFields fields={groupFields(group)} />
      <TextField
        label="Patrón"
        value={pattern}
        onChange={changePattern}
        error={!check.valid}
        helperText={check.hint}
        fullWidth
        slotProps={{ htmlInput: patternInputProps }}
      />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Categoría</Typography>
        {categoryPicker}
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button fullWidth component={RouterLink} to={inboxTransactionsHref(group.pattern)} sx={tapTargetSx}>
          Ver movimientos
        </Button>
        <Button fullWidth variant="contained" disabled={!draft || creating} onClick={create} sx={tapTargetSx}>
          Crear regla
        </Button>
      </Box>
    </Box>
  );
};

export const InboxRuleSheet = ({ open, group, groups, categories, creating, onClose, onCreate }: InboxRuleSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={group?.merchants[0] ?? "Comercio"}>
    {group && (
      <InboxRuleForm
        key={group.pattern}
        group={group}
        groups={groups}
        categories={categories}
        creating={creating}
        onClose={onClose}
        onCreate={onCreate}
      />
    )}
  </BottomSheet>
);
