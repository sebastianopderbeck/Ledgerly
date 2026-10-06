import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { UNCATEGORIZED } from "../categoryOptions.js";
import { formatPesos, monthInText, type UnbudgetedCategory } from "../budgets.js";
import { compactCardContentSx } from "./compactCardContentSx.js";
import { tapTargetSx } from "./tapTarget.js";

interface UnbudgetedCategoriesProps {
  month: string;
  categories: UnbudgetedCategory[];
  onAdd: (category: string) => void;
}

interface UnbudgetedRowProps {
  item: UnbudgetedCategory;
  onAdd: (category: string) => void;
}

const listSx: SxProps<Theme> = { listStyle: "none", m: 0, p: 0 };

const rowSx: SxProps<Theme> = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  py: 1,
  borderTop: 1,
  borderColor: "divider",
  "&:first-of-type": { borderTop: 0 },
};

const UnbudgetedRow = ({ item: { category, total }, onAdd }: UnbudgetedRowProps) => {
  const add = () => onAdd(category);
  const action = category === UNCATEGORIZED ? (
    <Button size="small" component={RouterLink} to="/rules" sx={tapTargetSx}>Categorizar</Button>
  ) : (
    <Button size="small" onClick={add} aria-label={`Poner tope a ${category}`} sx={tapTargetSx}>Poner tope</Button>
  );

  return (
    <Box component="li" aria-label={category} sx={rowSx}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap>{category}</Typography>
        <Typography variant="body2" color="text.secondary">{formatPesos(total)}</Typography>
      </Box>
      {action}
    </Box>
  );
};

export const UnbudgetedCategories = ({ month, categories, onAdd }: UnbudgetedCategoriesProps) => {
  const rows = categories.map((item) => <UnbudgetedRow key={item.category} item={item} onAdd={onAdd} />);

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent sx={compactCardContentSx}>
        <Typography variant="h6" sx={{ mb: 1 }}>{`Sin tope en ${monthInText(month)}`}</Typography>
        <Box component="ul" sx={listSx}>{rows}</Box>
      </CardContent>
    </Card>
  );
};
