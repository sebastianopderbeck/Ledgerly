import { useSearchParams } from "react-router-dom";
import { TextField } from "@mui/material";

interface SearchFilterProps { fullWidth?: boolean; }

export const SearchFilter = ({ fullWidth = false }: SearchFilterProps) => {
  const [params, setParams] = useSearchParams();

  const setSearch = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set("search", value); else next.delete("search");
    setParams(next, { replace: true });
  };

  return (
    <TextField
      label="Buscar comercio" size="small" fullWidth={fullWidth}
      value={params.get("search") ?? ""} onChange={(event) => setSearch(event.target.value)}
    />
  );
};
