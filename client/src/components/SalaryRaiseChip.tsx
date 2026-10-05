import { Chip, type ChipProps } from "@mui/material";
import { raiseVerdictLabel, type RaiseVerdict, type SalaryRaise } from "../salaryRaises.js";

interface SalaryRaiseChipProps {
  raise: SalaryRaise;
}

const VERDICT_COLOR: Record<RaiseVerdict, ChipProps["color"]> = {
  real: "success",
  ipc: "default",
  debajo: "error",
  parcial: "warning",
};

export const SalaryRaiseChip = ({ raise }: SalaryRaiseChipProps) => (
  <Chip label={raiseVerdictLabel(raise)} color={VERDICT_COLOR[raise.verdict]} size="small" variant="outlined" />
);
