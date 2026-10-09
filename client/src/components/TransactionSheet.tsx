import { useState, type SyntheticEvent } from "react";
import { Autocomplete, Box, Button, TextField, type AutocompleteRenderInputParams } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { TransactionDTO } from "@ledgerly/shared";
import { useCategories } from "../api/hooks.js";
import { formatMoney } from "../format.js";
import { canMarkAsSubscription } from "../subscriptions.js";
import { installmentLabel } from "../transactionInstallment.js";
import { BottomSheet } from "./BottomSheet.js";
import { RecordFields, type RecordField } from "./RecordCard.js";
import { MIN_TAP_SIZE, tapTargetSx } from "./tapTarget.js";

interface TransactionSheetProps {
  transaction: TransactionDTO | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, category: string) => void;
  onDelete: (transaction: TransactionDTO) => void;
  onMarkSubscription: (transactionId: string) => void;
}

interface TransactionFormProps {
  transaction: TransactionDTO;
  onClose: () => void;
  onSave: (id: string, category: string) => void;
  onDelete: (transaction: TransactionDTO) => void;
  onMarkSubscription: (transactionId: string) => void;
}

const NO_CATEGORIES: string[] = [];

const markSubscriptionSx: SxProps<Theme> = { minHeight: MIN_TAP_SIZE, mt: 2 };

const renderCategoryInput = (params: AutocompleteRenderInputParams) => <TextField {...params} label="Categoría" />;

const TransactionForm = ({ transaction, onClose, onSave, onDelete, onMarkSubscription }: TransactionFormProps) => {
  const { data: categories = NO_CATEGORIES } = useCategories();
  const [category, setCategory] = useState(transaction.category);
  const nextCategory = category.trim();
  const changed = nextCategory !== "" && nextCategory !== transaction.category;

  const fields: RecordField[] = [
    { label: "Fecha", value: transaction.date },
    { label: "Tipo", value: transaction.type },
    { label: "Monto", value: formatMoney(transaction.amount, transaction.currency) },
    { label: "Cuota", value: installmentLabel(transaction) ?? "—" },
  ];

  const changeCategory = (_event: SyntheticEvent, value: string) => setCategory(value);

  const save = () => {
    if (!changed) return;
    onSave(transaction.id, nextCategory);
    onClose();
  };

  const remove = () => onDelete(transaction);

  const markSubscription = () => {
    onMarkSubscription(transaction.id);
    onClose();
  };

  const subscriptionButton = canMarkAsSubscription(transaction) && (
    <Button fullWidth variant="outlined" onClick={markSubscription} sx={markSubscriptionSx}>Es una suscripción</Button>
  );

  return (
    <>
      <RecordFields fields={fields} />
      <Autocomplete
        freeSolo
        options={categories}
        inputValue={category}
        onInputChange={changeCategory}
        renderInput={renderCategoryInput}
        sx={{ mt: 2.5 }}
      />
      {subscriptionButton}
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button fullWidth color="error" onClick={remove} sx={tapTargetSx}>Borrar</Button>
        <Button fullWidth variant="contained" disabled={!changed} onClick={save} sx={tapTargetSx}>Guardar</Button>
      </Box>
    </>
  );
};

export const TransactionSheet = ({ transaction, open, onClose, onSave, onDelete, onMarkSubscription }: TransactionSheetProps) => (
  <BottomSheet open={open} onClose={onClose} title={transaction?.merchant ?? "Movimiento"}>
    {transaction && (
      <TransactionForm
        key={transaction.id}
        transaction={transaction}
        onClose={onClose}
        onSave={onSave}
        onDelete={onDelete}
        onMarkSubscription={onMarkSubscription}
      />
    )}
  </BottomSheet>
);
