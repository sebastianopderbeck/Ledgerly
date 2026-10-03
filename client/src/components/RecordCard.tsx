import { useCallback, useState, type ReactNode } from "react";
import { Box, Button, Card, CardContent, Collapse, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { MIN_TAP_SIZE } from "./tapTarget.js";

export interface RecordField {
  label: string;
  value: ReactNode;
}

interface RecordFieldsProps {
  fields: RecordField[];
  emphasis?: boolean;
}

interface RecordCardProps {
  title: string;
  label?: string;
  meta?: string;
  badge?: ReactNode;
  action?: ReactNode;
  highlights: RecordField[];
  details: RecordField[];
}

export const recordListSx: SxProps<Theme> = { display: "grid", gap: 1.5 };

const fieldsGridSx: SxProps<Theme> = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 2,
  rowGap: 1.5,
  m: 0,
};

const chevronSx = (expanded: boolean): SxProps<Theme> => ({
  transform: expanded ? "rotate(180deg)" : "none",
  transition: "transform 200ms ease",
});

export const RecordFields = ({ fields, emphasis = false }: RecordFieldsProps) => {
  const valueVariant = emphasis ? "subtitle1" : "body2";
  const valueWeight = emphasis ? 600 : 400;
  const items = fields.map(({ label, value }) => (
    <Box key={label} sx={{ minWidth: 0 }}>
      <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
      <Typography component="dd" variant={valueVariant} sx={{ m: 0, fontWeight: valueWeight, overflowWrap: "anywhere" }}>
        {value}
      </Typography>
    </Box>
  ));
  return <Box component="dl" sx={fieldsGridSx}>{items}</Box>;
};

export const RecordCard = ({ title, label = title, meta, badge, action, highlights, details }: RecordCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  const toggleLabel = expanded ? "Ocultar detalle" : "Ver detalle";
  const hasDetails = details.length > 0;

  return (
    <Card component="article" aria-label={label}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{title}</Typography>
              {badge}
            </Box>
            {meta && <Typography variant="body2" color="text.secondary">{meta}</Typography>}
          </Box>
          {action}
        </Box>
        <RecordFields fields={highlights} emphasis />
        {hasDetails && (
          <>
            <Button
              size="small"
              onClick={toggle}
              aria-expanded={expanded}
              endIcon={<ExpandMoreIcon sx={chevronSx(expanded)} />}
              sx={{ mt: 1, ml: -1, minHeight: MIN_TAP_SIZE }}
            >
              {toggleLabel}
            </Button>
            <Collapse in={expanded} unmountOnExit>
              <Box sx={{ pt: 1 }}>
                <RecordFields fields={details} />
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
};
