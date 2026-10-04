import type { ImportedFileDTO, ImportedFileKind } from "@ledgerly/shared";

export interface ImportedFilesFilters {
  kinds: ImportedFileKind[];
  year: string;
  search: string;
  onlyNeedsReview: boolean;
}

export const EMPTY_IMPORTED_FILES_FILTERS: ImportedFilesFilters = {
  kinds: [],
  year: "",
  search: "",
  onlyNeedsReview: false,
};

export const IMPORTED_FILE_KIND_LABELS: Record<ImportedFileKind, string> = {
  statement: "Tarjeta",
  coupon: "Crédito",
  auto: "Auto",
  payslip: "Sueldo",
};

export const isImportedFileKind = (value: string): value is ImportedFileKind =>
  Object.hasOwn(IMPORTED_FILE_KIND_LABELS, value);

export const IMPORTED_FILE_KINDS = Object.keys(IMPORTED_FILE_KIND_LABELS).filter(isImportedFileKind);

const normalize = (text: string): string =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es-AR");

const yearOf = (file: ImportedFileDTO): string => (file.documentDate ?? file.uploadedAt).slice(0, 4);

const matchesSearch = (file: ImportedFileDTO, search: string): boolean => {
  const needle = normalize(search.trim());
  return !needle || normalize(`${file.fileName} ${file.description}`).includes(needle);
};

export const filterImportedFiles = (
  files: ImportedFileDTO[],
  { kinds, year, search, onlyNeedsReview }: ImportedFilesFilters,
): ImportedFileDTO[] =>
  files.filter((file) =>
    (kinds.length === 0 || kinds.includes(file.kind))
    && (!year || yearOf(file) === year)
    && (!onlyNeedsReview || file.needsReview)
    && matchesSearch(file, search));

export const importedFileYears = (files: ImportedFileDTO[]): string[] =>
  [...new Set(files.map(yearOf))].sort().reverse();

export const importedFileDeleteMessage = (file: ImportedFileDTO | null): string => {
  if (!file) return "";
  const cascade = file.kind === "statement" ? " También se borran sus movimientos." : "";
  return `¿Borrar ${file.fileName}?${cascade} Esta acción no se puede deshacer.`;
};
