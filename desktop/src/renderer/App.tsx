/**
 * Top-level router.
 *
 * No react-router; the app's flow is small enough that a switch on the
 * auth phase covers it. Animated transitions between screens via
 * AnimatePresence so it feels continuous.
 */
import { AnimatePresence } from "framer-motion";
import { AuthProvider, useAuth } from "./lib/auth";
import { ViewProvider } from "./lib/view";
import { Splash } from "./components/Splash";
import { Login } from "./screens/Login";
import { Setup } from "./screens/Setup";
import { ConfigBackend } from "./screens/ConfigBackend";
import { AppShell } from "./screens/AppShell";

export function App() {
  return (
    <AuthProvider>
      <ViewProvider>
        <Router />
      </ViewProvider>
    </AuthProvider>
  );
}

function Router() {
  const { phase } = useAuth();
  return (
    <AnimatePresence mode="wait">
      {phase === "loading" && <Splash key="splash" status="Connecting…" />}
      {phase === "needs-config" && <ConfigBackend key="config" />}
      {phase === "needs-setup" && <Setup key="setup" />}
      {phase === "needs-login" && <Login key="login" />}
      {phase === "ready" && <AppShell key="app" />}
    </AnimatePresence>
  );
}
