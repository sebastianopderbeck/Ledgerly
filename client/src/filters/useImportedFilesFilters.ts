import { useCallback, useMemo, useState } from "react";
import type { ImportedFileDTO } from "@ledgerly/shared";
import {
  EMPTY_IMPORTED_FILES_FILTERS, filterImportedFiles, importedFileYears, type ImportedFilesFilters,
} from "../importedFiles.js";

export interface ImportedFilesFiltersState {
  filters: ImportedFilesFilters;
  updateFilters: (patch: Partial<ImportedFilesFilters>) => void;
  visibleFiles: ImportedFileDTO[];
  yearOptions: string[];
}

export const useImportedFilesFilters = (files: ImportedFileDTO[]): ImportedFilesFiltersState => {
  const [filters, setFilters] = useState<ImportedFilesFilters>(EMPTY_IMPORTED_FILES_FILTERS);

  const updateFilters = useCallback(
    (patch: Partial<ImportedFilesFilters>) => setFilters((current) => ({ ...current, ...patch })),
    [],
  );
  const visibleFiles = useMemo(() => filterImportedFiles(files, filters), [files, filters]);
  const yearOptions = useMemo(() => importedFileYears(files), [files]);

  return { filters, updateFilters, visibleFiles, yearOptions };
};
