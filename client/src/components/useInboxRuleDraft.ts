import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { checkPattern, type InboxRuleDraft, type PatternCheck } from "../uncategorizedInbox.js";

export interface InboxRuleDraftState {
  pattern: string;
  changePattern: (event: ChangeEvent<HTMLInputElement>) => void;
  category: string | null;
  changeCategory: (category: string | null) => void;
  check: PatternCheck;
  draft: InboxRuleDraft | null;
}

export function useInboxRuleDraft(group: UncategorizedGroupDTO, groups: UncategorizedGroupDTO[]): InboxRuleDraftState {
  const [pattern, setPattern] = useState(group.pattern);
  const [category, setCategory] = useState<string | null>(null);
  const check = useMemo(() => checkPattern(pattern, group, groups), [pattern, group, groups]);
  const changePattern = useCallback((event: ChangeEvent<HTMLInputElement>) => setPattern(event.target.value), []);
  const draft = useMemo(
    () => (check.valid && category !== null ? { pattern: pattern.trim(), category } : null),
    [check.valid, category, pattern],
  );
  return { pattern, changePattern, category, changeCategory: setCategory, check, draft };
}
