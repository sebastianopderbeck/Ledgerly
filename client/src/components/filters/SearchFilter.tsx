import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { TextField } from "@mui/material";

interface SearchFilterProps { fullWidth?: boolean; touch?: boolean; }

const touchInputProps = {
  enterKeyHint: "search",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
} as const;

const blurOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
};

export const SearchFilter = ({ fullWidth = false, touch = false }: SearchFilterProps) => {
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
      onKeyDown={touch ? blurOnEnter : undefined}
      slotProps={touch ? { htmlInput: touchInputProps } : undefined}
    />
  );
};
