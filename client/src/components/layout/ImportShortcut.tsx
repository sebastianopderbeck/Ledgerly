import { NavLink } from "react-router-dom";
import { Badge, IconButton, Tooltip } from "@mui/material";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import { useMailNotice } from "../../api/hooks.js";
import { useMe } from "../../auth/useMe.js";
import { useNavSearch } from "./useNavSearch.js";

export const ImportShortcut = () => {
  const search = useNavSearch();
  const { data: me } = useMe();
  const { data: notice } = useMailNotice(me?.isOwner === true);
  const pending = notice?.pending === true;
  const label = pending ? "importar, hay novedades de mails" : "importar";
  return (
    <Tooltip title="Importar">
      <IconButton
        component={NavLink}
        to={{ pathname: "/import", search }}
        color="inherit"
        aria-label={label}
        sx={{ "&[aria-current='page']": { color: "primary.main" } }}
      >
        <Badge color="primary" variant="dot" invisible={!pending}>
          <UploadFileOutlinedIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
};
