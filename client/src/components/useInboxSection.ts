import { useCallback, useMemo, useState, type MouseEvent } from "react";
import type { CategoryRuleDTO, UncategorizedGroupDTO, UncategorizedInboxDTO } from "@ledgerly/shared";
import { useCategories, useCreateInboxRule, useUncategorizedInbox } from "../api/hooks.js";
import { categoryOptions } from "../categoryOptions.js";
import {
  INBOX_PREVIEW_SIZE, inboxRuleFeedback, sortInboxGroups, type InboxFeedback, type InboxOrder, type InboxRuleDraft,
} from "../uncategorizedInbox.js";

export type CreateInboxRule = (draft: InboxRuleDraft, onCreated?: () => void) => void;

export interface InboxViewProps {
  groups: UncategorizedGroupDTO[];
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  onCreate: CreateInboxRule;
}

export interface InboxSection {
  inbox: UncategorizedInboxDTO | undefined;
  isLoading: boolean;
  error: Error | null;
  order: InboxOrder;
  changeOrder: (event: MouseEvent<HTMLElement>, order: InboxOrder | null) => void;
  showAll: boolean;
  toggleShowAll: () => void;
  visibleGroups: UncategorizedGroupDTO[];
  allGroups: UncategorizedGroupDTO[];
  categories: string[];
  creating: boolean;
  createRule: CreateInboxRule;
  feedback: InboxFeedback | null;
  dismissFeedback: () => void;
}

const NO_GROUPS: UncategorizedGroupDTO[] = [];
const NO_CATEGORIES: string[] = [];

export function useInboxSection(rules: CategoryRuleDTO[]): InboxSection {
  const { data: inbox, isLoading, error } = useUncategorizedInbox();
  const { data: categoryNames = NO_CATEGORIES } = useCategories();
  const { mutate, isPending: creating } = useCreateInboxRule();
  const [order, setOrder] = useState<InboxOrder>("amount");
  const [showAll, setShowAll] = useState(false);
  const [feedback, setFeedback] = useState<InboxFeedback | null>(null);

  const groups = inbox?.groups ?? NO_GROUPS;
  const allGroups = useMemo(() => sortInboxGroups(groups, order), [groups, order]);
  const visibleGroups = useMemo(
    () => (showAll ? allGroups : allGroups.slice(0, INBOX_PREVIEW_SIZE)),
    [allGroups, showAll],
  );
  const categories = useMemo(() => categoryOptions(categoryNames, rules), [categoryNames, rules]);

  const changeOrder = useCallback((_event: MouseEvent<HTMLElement>, next: InboxOrder | null) => {
    if (next !== null) setOrder(next);
  }, []);
  const toggleShowAll = useCallback(() => setShowAll((current) => !current), []);
  const dismissFeedback = useCallback(() => setFeedback(null), []);
  const createRule = useCallback<CreateInboxRule>((draft, onCreated) => {
    mutate(draft, {
      onSuccess: (result) => {
        setFeedback(inboxRuleFeedback(result));
        onCreated?.();
      },
      onError: (mutationError) => setFeedback({ severity: "error", message: mutationError.message }),
    });
  }, [mutate]);

  return {
    inbox, isLoading, error, order, changeOrder, showAll, toggleShowAll, visibleGroups, allGroups, categories,
    creating, createRule, feedback, dismissFeedback,
  };
}
