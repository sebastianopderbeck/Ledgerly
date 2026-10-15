import { useCallback, useMemo, useState } from "react";
import type { FixedServiceDTO } from "@ledgerly/shared";
import { useCreateFixedService, useDeleteFixedService, useUpdateFixedService } from "../api/hooks.js";
import type { FixedServiceRequest } from "../fixedServices.js";

export interface FixedServiceEditorState {
  open: boolean;
  service: FixedServiceDTO | null;
  error: string | null;
  saving: boolean;
  pendingDelete: FixedServiceDTO | null;
  openNew: () => void;
  openEdit: (serviceId: string) => void;
  close: () => void;
  save: (request: FixedServiceRequest) => void;
  askDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

const findService = (services: FixedServiceDTO[], id: string | null): FixedServiceDTO | null =>
  (id === null ? null : services.find((service) => service.id === id) ?? null);

export const useFixedServiceEditor = (services: FixedServiceDTO[]): FixedServiceEditorState => {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { mutate: createService, reset: resetCreate, isPending: creating, error: createError } = useCreateFixedService();
  const { mutate: updateService, reset: resetUpdate, isPending: updating, error: updateError } = useUpdateFixedService();
  const { mutate: deleteService } = useDeleteFixedService();

  const service = useMemo(() => findService(services, serviceId), [services, serviceId]);
  const pendingDelete = useMemo(() => findService(services, pendingDeleteId), [services, pendingDeleteId]);
  const error = (createError ?? updateError)?.message ?? null;

  const openWith = useCallback((id: string | null) => {
    resetCreate();
    resetUpdate();
    setServiceId(id);
    setOpen(true);
  }, [resetCreate, resetUpdate]);

  const openNew = useCallback(() => openWith(null), [openWith]);
  const openEdit = useCallback((id: string) => openWith(id), [openWith]);
  const close = useCallback(() => setOpen(false), []);

  const save = useCallback((request: FixedServiceRequest) => {
    if (request.kind === "create") {
      createService(request.body, { onSuccess: close });
      return;
    }
    updateService({ id: request.id, body: request.body }, { onSuccess: close });
  }, [createService, updateService, close]);

  const askDelete = useCallback(() => {
    setOpen(false);
    setPendingDeleteId(serviceId);
  }, [serviceId]);

  const cancelDelete = useCallback(() => setPendingDeleteId(null), []);

  const confirmDelete = useCallback(() => {
    if (pendingDeleteId !== null) deleteService(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteService]);

  return {
    open, service, error, saving: creating || updating, pendingDelete,
    openNew, openEdit, close, save, askDelete, cancelDelete, confirmDelete,
  };
};
