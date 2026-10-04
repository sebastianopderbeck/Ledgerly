import { useCallback, useMemo, useState } from "react";
import type { ManualAssetDTO } from "@ledgerly/shared";
import {
  useCreateManualAsset, useDeleteAssetValuation, useDeleteManualAsset, useUpdateManualAsset,
} from "../api/hooks.js";
import type { AssetRequest } from "../netWorth.js";

export interface ManualAssetEditorState {
  open: boolean;
  asset: ManualAssetDTO | null;
  error: string | null;
  saving: boolean;
  pendingDelete: ManualAssetDTO | null;
  openNew: () => void;
  openEdit: (assetId: string) => void;
  close: () => void;
  save: (request: AssetRequest) => void;
  askDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
  deleteValuation: (fecha: string) => void;
}

const findAsset = (assets: ManualAssetDTO[], id: string | null): ManualAssetDTO | null =>
  (id === null ? null : assets.find((asset) => asset.id === id) ?? null);

export const useManualAssetEditor = (assets: ManualAssetDTO[]): ManualAssetEditorState => {
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { mutate: createAsset, reset: resetCreate, isPending: creating, error: createError } = useCreateManualAsset();
  const { mutate: updateAsset, reset: resetUpdate, isPending: updating, error: updateError } = useUpdateManualAsset();
  const { mutate: deleteAsset } = useDeleteManualAsset();
  const { mutate: removeValuation, reset: resetValuation, error: valuationError } = useDeleteAssetValuation();

  const asset = useMemo(() => findAsset(assets, assetId), [assets, assetId]);
  const pendingDelete = useMemo(() => findAsset(assets, pendingDeleteId), [assets, pendingDeleteId]);
  const error = (createError ?? updateError ?? valuationError)?.message ?? null;

  const openWith = useCallback((id: string | null) => {
    resetCreate();
    resetUpdate();
    resetValuation();
    setAssetId(id);
    setOpen(true);
  }, [resetCreate, resetUpdate, resetValuation]);

  const openNew = useCallback(() => openWith(null), [openWith]);
  const openEdit = useCallback((id: string) => openWith(id), [openWith]);
  const close = useCallback(() => setOpen(false), []);

  const save = useCallback((request: AssetRequest) => {
    if (request.kind === "create") {
      createAsset(request.body, { onSuccess: close });
      return;
    }
    updateAsset({ id: request.id, body: request.body }, { onSuccess: close });
  }, [createAsset, updateAsset, close]);

  const askDelete = useCallback(() => {
    setOpen(false);
    setPendingDeleteId(assetId);
  }, [assetId]);

  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);

  const confirmDelete = useCallback(() => {
    if (pendingDeleteId !== null) deleteAsset(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteAsset]);

  const deleteValuation = useCallback((fecha: string) => {
    if (assetId !== null) removeValuation({ id: assetId, fecha });
  }, [assetId, removeValuation]);

  return {
    open, asset, error, saving: creating || updating, pendingDelete,
    openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete, deleteValuation,
  };
};
