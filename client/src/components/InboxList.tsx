import { Box, List, ListItem, ListItemButton, Typography } from "@mui/material";
import type { UncategorizedGroupDTO } from "@ledgerly/shared";
import { groupCaption, groupTotalLabel } from "../uncategorizedInbox.js";
import { InboxRuleSheet } from "./InboxRuleSheet.js";
import type { InboxViewProps } from "./useInboxSection.js";
import { useSheetTarget } from "./useSheetTarget.js";

interface InboxListItemProps {
  group: UncategorizedGroupDTO;
  onOpen: (group: UncategorizedGroupDTO) => void;
}

const InboxListItem = ({ group, onOpen }: InboxListItemProps) => {
  const open = () => onOpen(group);
  return (
    <ListItem disablePadding divider>
      <ListItemButton onClick={open} sx={{ minHeight: 56, px: 1, py: 1.25 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{group.merchants[0]}</Typography>
            <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{groupTotalLabel(group)}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {groupCaption(group)}
          </Typography>
        </Box>
      </ListItemButton>
    </ListItem>
  );
};

export const InboxList = ({ groups, allGroups, categories, creating, onCreate }: InboxViewProps) => {
  const { target, open, show, close } = useSheetTarget<UncategorizedGroupDTO>();
  const items = groups.map((group) => <InboxListItem key={group.pattern} group={group} onOpen={show} />);

  return (
    <>
      <List disablePadding>{items}</List>
      <InboxRuleSheet
        open={open}
        group={target}
        groups={allGroups}
        categories={categories}
        creating={creating}
        onClose={close}
        onCreate={onCreate}
      />
    </>
  );
};
