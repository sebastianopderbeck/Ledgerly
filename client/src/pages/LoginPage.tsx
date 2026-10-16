import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import { useSearchParams } from "react-router-dom";
import { GOOGLE_LOGIN_URL } from "../auth/useMe.js";
import { Brand } from "../components/layout/Brand.js";

const LOGIN_ERRORS = new Map([
  ["no-autorizado", "Ese mail no tiene acceso a Ledgerly"],
  ["login-fallido", "No se pudo entrar con Google. Probá de nuevo"],
]);

export const LoginPage = () => {
  const [params] = useSearchParams();
  const errorMessage = LOGIN_ERRORS.get(params.get("error") ?? "");
  const errorAlert = errorMessage ? <Alert severity="error" sx={{ width: "100%" }}>{errorMessage}</Alert> : null;
  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={3} alignItems="center" sx={{ width: "100%", maxWidth: 360 }}>
        <Brand />
        <Typography color="text.secondary" textAlign="center">Entrá con tu cuenta de Google para ver tus gastos.</Typography>
        {errorAlert}
        <Button variant="contained" size="large" fullWidth href={GOOGLE_LOGIN_URL} startIcon={<GoogleIcon />}>
          Entrar con Google
        </Button>
      </Stack>
    </Box>
  );
};
