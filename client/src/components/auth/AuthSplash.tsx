import { Alert, Box, CircularProgress, Stack } from "@mui/material";
import { Brand } from "../layout/Brand.js";

interface AuthSplashProps {
  message?: string | null;
}

export const AuthSplash = ({ message = null }: AuthSplashProps) => {
  const status = message
    ? <Alert severity="error">{message}</Alert>
    : <CircularProgress aria-label="cargando" />;
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={3} alignItems="center">
        <Brand />
        {status}
      </Stack>
    </Box>
  );
};
