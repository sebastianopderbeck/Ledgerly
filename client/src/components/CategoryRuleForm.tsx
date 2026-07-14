import { useState } from "react";
import { Box, Button, MenuItem, TextField } from "@mui/material";

interface RuleFormValues { priority: number; matchType: string; pattern: string; category: string; }
interface CategoryRuleFormProps { onCreate: (values: RuleFormValues) => void; }

export const CategoryRuleForm = ({ onCreate }: CategoryRuleFormProps) => {
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState("");
  const [matchType, setMatchType] = useState("contains");

  const submit = () => {
    if (!pattern || !category) return;
    onCreate({ priority: 100, matchType, pattern, category });
    setPattern("");
    setCategory("");
  };

  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 3, flexWrap: "wrap" }}>
      <TextField label="Patrón" size="small" value={pattern} onChange={(e) => setPattern(e.target.value)} />
      <TextField select label="Tipo" size="small" sx={{ minWidth: 120 }} value={matchType} onChange={(e) => setMatchType(e.target.value)}>
        <MenuItem value="contains">contiene</MenuItem>
        <MenuItem value="regex">regex</MenuItem>
      </TextField>
      <TextField label="Categoría" size="small" value={category} onChange={(e) => setCategory(e.target.value)} />
      <Button variant="contained" onClick={submit}>Agregar</Button>
    </Box>
  );
};
