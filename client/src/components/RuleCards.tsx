import type { ChangeEvent } from "react";
import { Box, Card, CardActionArea, Chip, Switch, Typography } from "@mui/material";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { recordListSx } from "./RecordCard.js";
import { MATCH_TYPE_LABELS } from "./RuleSheet.js";

interface RuleCardsProps {
  rules: CategoryRuleDTO[];
  onEdit: (rule: CategoryRuleDTO) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

interface RuleCardProps {
  rule: CategoryRuleDTO;
  onEdit: (rule: CategoryRuleDTO) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

const RuleCard = ({ rule, onEdit, onToggle }: RuleCardProps) => {
  const edit = () => onEdit(rule);
  const toggle = (event: ChangeEvent<HTMLInputElement>) => onToggle(rule.id, event.target.checked);
  const summary = `${MATCH_TYPE_LABELS[rule.matchType]} · prioridad ${rule.priority}`;

  return (
    <Card component="article" aria-label={rule.pattern}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <CardActionArea onClick={edit} aria-label={`editar ${rule.pattern}`} sx={{ flex: 1, minWidth: 0, p: 2 }}>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 600, overflowWrap: "anywhere" }}>{rule.pattern}</Typography>
          <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mt: 0.75 }}>
            <Chip size="small" label={rule.category} />
            <Typography variant="caption" color="text.secondary">{summary}</Typography>
          </Box>
        </CardActionArea>
        <Switch
          checked={rule.enabled}
          onChange={toggle}
          inputProps={{ "aria-label": `activa ${rule.pattern}` }}
          sx={{ mr: 1 }}
        />
      </Box>
    </Card>
  );
};

export const RuleCards = ({ rules, onEdit, onToggle }: RuleCardsProps) => {
  const cards = rules.map((rule) => <RuleCard key={rule.id} rule={rule} onEdit={onEdit} onToggle={onToggle} />);
  return <Box sx={recordListSx}>{cards}</Box>;
};
