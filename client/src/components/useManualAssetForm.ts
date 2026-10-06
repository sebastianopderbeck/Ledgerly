import { useMemo, useState } from "react";
import type { Currency, ManualAssetDTO, ManualAssetType } from "@ledgerly/shared";
import { assetDraftFrom, assetRequest, type AssetDraft, type AssetRequest } from "../netWorth.js";

export interface ManualAssetFormState {
  draft: AssetDraft;
  setNombre: (nombre: string) => void;
  setTipo: (tipo: ManualAssetType) => void;
  setMoneda: (moneda: Currency) => void;
  setMonto: (monto: string) => void;
  setFecha: (fecha: string) => void;
  request: AssetRequest | null;
}

export const useManualAssetForm = (asset: ManualAssetDTO | null, today: string): ManualAssetFormState => {
  const [draft, setDraft] = useState<AssetDraft>(() => assetDraftFrom(asset, today));
  const request = useMemo(() => assetRequest(draft, asset, today), [draft, asset, today]);

  const setField = <Field extends keyof AssetDraft>(field: Field) => (value: AssetDraft[Field]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return {
    draft,
    setNombre: setField("nombre"),
    setTipo: setField("tipo"),
    setMoneda: setField("moneda"),
    setMonto: setField("monto"),
    setFecha: setField("fecha"),
    request,
  };
};
