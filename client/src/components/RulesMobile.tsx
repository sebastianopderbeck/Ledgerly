import { useCallback, useState } from "react";
import { Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { CategoryRuleDTO } from "@ledgerly/shared";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { RuleCards } from "./RuleCards.js";
import { RuleSheet, type RuleDraft } from "./RuleSheet.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface RulesMobileProps {
  rules: CategoryRuleDTO[];
  onCreate: (draft: RuleDraft) => void;
  onUpdate: (id: string, body: Partial<CategoryRuleDTO>) => void;
  onDelete: (id: string) => void;
}

const deleteMessage = (rule: CategoryRuleDTO | null): string =>
  rule ? `¿Borrar la regla «${rule.pattern}»? Esta acción no se puede deshacer.` : "";

export const RulesMobile = ({ rules, onCreate, onUpdate, onDelete }: RulesMobileProps) => {
  const { target, open, show, close } = useSheetTarget<CategoryRuleDTO | null>();
  const [pendingDelete, setPendingDelete] = useState<CategoryRuleDTO | null>(null);

  const openNew = useCallback(() => show(null), [show]);
  const toggle = useCallback((id: string, enabled: boolean) => onUpdate(id, { enabled }), [onUpdate]);
  const save = useCallback((draft: RuleDraft) => {
    if (target) onUpdate(target.id, draft);
    else onCreate(draft);
  }, [target, onUpdate, onCreate]);
  const askDelete = useCallback((rule: CategoryRuleDTO) => {
    close();
    setPendingDelete(rule);
  }, [close]);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const confirmDelete = () => {
    if (pendingDelete) onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <>
      <Button variant="contained" fullWidth startIcon={<AddIcon />} onClick={openNew} sx={{ mb: 2 }}>
        Nueva regla
      </Button>
      <RuleCards rules={rules} onEdit={show} onToggle={toggle} />
      <RuleSheet open={open} rule={target} onClose={close} onSave={save} onDelete={askDelete} />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Borrar regla"
        message={deleteMessage(pendingDelete)}
        confirmLabel="Borrar"
        onConfirm={confirmDelete}
        onClose={cancelDelete}
      />
    </>
  );
};
