import { Typography } from "@mui/material";
import { hasTabs, sectionTitle, type NavSection } from "./navItems.js";
import { SectionTabs } from "./SectionTabs.js";

interface SectionHeaderProps {
  section: NavSection;
}

export const SectionHeader = ({ section }: SectionHeaderProps) => {
  const withTabs = hasTabs(section);

  return (
    <>
      <Typography variant="h4" sx={{ mb: withTabs ? 2 : 3 }}>{sectionTitle(section)}</Typography>
      {withTabs && <SectionTabs section={section} />}
    </>
  );
};
