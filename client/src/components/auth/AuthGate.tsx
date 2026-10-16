import type { ReactNode } from "react";
import { useMe } from "../../auth/useMe.js";
import { LoginPage } from "../../pages/LoginPage.js";
import { AuthSplash } from "./AuthSplash.js";

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { data: me, isPending, isError, error } = useMe();
  if (isPending) return <AuthSplash />;
  if (isError) return <AuthSplash message={error.message} />;
  if (!me) return <LoginPage />;
  return <>{children}</>;
};
