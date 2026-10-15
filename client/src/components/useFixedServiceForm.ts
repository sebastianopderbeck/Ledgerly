import { useMemo, useState } from "react";
import type { FixedServiceCadencia, FixedServiceDTO } from "@ledgerly/shared";
import {
  fixedServiceDraftFrom, fixedServiceRequest, type FixedServiceDraft, type FixedServiceRequest,
} from "../fixedServices.js";

export interface FixedServiceFormState {
  draft: FixedServiceDraft;
  setNombre: (nombre: string) => void;
  setMonto: (monto: string) => void;
  setCadencia: (cadencia: FixedServiceCadencia) => void;
  setDesde: (desde: string) => void;
  setHasta: (hasta: string) => void;
  request: FixedServiceRequest | null;
}

export const useFixedServiceForm = (service: FixedServiceDTO | null, mesActual: string): FixedServiceFormState => {
  const [draft, setDraft] = useState<FixedServiceDraft>(() => fixedServiceDraftFrom(service, mesActual));
  const request = useMemo(() => fixedServiceRequest(draft, service), [draft, service]);

  const setField = <Field extends keyof FixedServiceDraft>(field: Field) => (value: FixedServiceDraft[Field]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  return {
    draft,
    setNombre: setField("nombre"),
    setMonto: setField("monto"),
    setCadencia: setField("cadencia"),
    setDesde: setField("desde"),
    setHasta: setField("hasta"),
    request,
  };
};
