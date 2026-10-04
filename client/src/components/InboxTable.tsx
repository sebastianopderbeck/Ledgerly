import type { SyntheticEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Autocomplete, Box, Button, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
  type AutocompleteRenderInputParams,
} from "@mui/material";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { groupCaption, groupTotalLabel, inboxTransactionsHref } from "../uncategorizedInbox.js";
import { patternInputProps } from "./RuleSheet.js";
import type { CreateInboxRule, InboxViewProps } from "./useInboxSection.js";
import { useInboxRuleDraft } from "./useInboxRuleDraft.js";

interface InboxGroupRowProps {
  group: UncategorizedGroupDTO;
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onCreate: CreateInboxRule;
}

const patternHtmlInput = { ...patternInputProps, "aria-label": "Patrón" };

const renderCategoryInput = (params: AutocompleteRenderInputParams) => <TextField {...params} label="Categoría" />;

const InboxGroupRow = ({ group, allGroups, categories, creating, onCreate }: InboxGroupRowProps) => {
  const { pattern, changePattern, category, changeCategory, check, draft } = useInboxRuleDraft(group, allGroups);
  const merchant = group.merchants[0];
  const selectCategory = (_event: SyntheticEvent, value: string | null) => changeCategory(value);
  const create = () => {
    if (draft) onCreate(draft);
  };
  const merchantName = <Typography variant="body2" sx={{ fontWeight: 600 }}>{merchant}</Typography>;
  const merchantLabel = group.merchants.length > 1
    ? <Tooltip title={group.merchants.join(" · ")}>{merchantName}</Tooltip>
    : merchantName;

  return (
    <TableRow>
      <TableCell>
        {merchantLabel}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{groupCaption(group)}</Typography>
      </TableCell>
      <TableCell align="right">{group.count}</TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{groupTotalLabel(group)}</TableCell>
      <TableCell>
        <TextField
          size="small"
          value={pattern}
          onChange={changePattern}
          error={!check.valid}
          helperText={check.hint}
          slotProps={{ htmlInput: patternHtmlInput }}
        />
      </TableCell>
      <TableCell>
        <Autocomplete
          size="small"
          options={categories}
          value={category}
          onChange={selectCategory}
          noOptionsText="No hay categorías"
          renderInput={renderCategoryInput}
          sx={{ width: 200 }}
        />
      </TableCell>
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Button variant="contained" size="small" disabled={!draft || creating} onClick={create}>Crear regla</Button>
        <IconButton
          component={RouterLink}
          to={inboxTransactionsHref(group.pattern)}
          size="small"
          aria-label={`ver movimientos de ${merchant}`}
          sx={{ ml: 1 }}
        >
          <ReceiptLongOutlinedIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

export const InboxTable = ({ groups, allGroups, categories, creating, onCreate }: InboxViewProps) => {
  const rows = groups.map((group) => (
    <InboxGroupRow
      key={group.pattern}
      group={group}
      allGroups={allGroups}
      categories={categories}
      creating={creating}
      onCreate={onCreate}
    />
  ));

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Comercio</TableCell>
            <TableCell align="right">Movs.</TableCell>
            <TableCell>Total</TableCell>
            <TableCell>Patrón</TableCell>
            <TableCell>Categoría</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>{rows}</TableBody>
      </Table>
    </Box>
  );
};
