/**
 * Auth + boot context.
 *
 * Owns the trio that drives the top-level routing decision:
 *   - config (where's the backend?)
 *   - session (do we have a valid token?)
 *   - setupStatus (does the backend need first-launch setup?)
 *
 * Children use `useAuth()` to read/mutate the session. Login / setup screens
 * call `signIn` / `runSetup`; the chrome's sign-out button calls `signOut`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppConfig, Permission, SessionInfo, User } from "@shared/types";
import { api, ApiError, setBaseUrl, setToken } from "./api";

type BootPhase =
  | "loading"           // initial probe of config + session + setup-status
  | "needs-setup"       // backend has no admin yet
  | "needs-login"       // backend ready, no valid session
  | "needs-config"      // can't reach the backend at all
  | "ready";            // session valid, user loaded

interface AuthState {
  phase: BootPhase;
  config: AppConfig | null;
  user: User | null;
  permissions: Permission[];
  /** Last error from probing/login, surfaced as a small UI hint. */
  error: string | null;
}

interface AuthCtx extends AuthState {
  setConfig: (patch: Partial<AppConfig>) => Promise<void>;
  signIn: (username: string, pin: string) => Promise<void>;
  runSetup: (username: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-run the initial probe (handy after the user fixes the backend URL). */
  reprobe: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    phase: "loading",
    config: null,
    user: null,
    permissions: [],
    error: null,
  });
  // Track the last token we put into memory so signOut can also forget it
  // from the main process's disk store.
  const tokenRef = useRef<string | null>(null);

  // ---- Probe: figure out where we should land --------------------------
  const probe = useCallback(async () => {
    setState((s) => ({ ...s, phase: "loading", error: null }));

    const config = await window.api.getConfig();
    setBaseUrl(config.backendUrl);

    // 1. Try to reach the backend.
    try {
      await api.health();
    } catch (e) {
      setState({
        phase: "needs-config",
        config,
        user: null,
        permissions: [],
        error:
          e instanceof ApiError
            ? `Cannot reach ${config.backendUrl}`
            : "Network error",
      });
      return;
    }

    // 2. Setup needed?
    const setup = await api.setupStatus();
    if (setup.needsSetup) {
      setState({
        phase: "needs-setup",
        config,
        user: null,
        permissions: [],
        error: null,
      });
      return;
    }

    // 3. Do we have a stored session that still works?
    const stored = await window.api.getStoredSession();
    if (stored?.token) {
      setToken(stored.token);
      tokenRef.current = stored.token;
      try {
        const me = await api.me();
        setState({
          phase: "ready",
          config,
          user: me.user,
          permissions: me.permissions,
          error: null,
        });
        return;
      } catch {
        // Token expired / invalid — clear and fall through to login.
        await window.api.saveSession(null);
        setToken(null);
        tokenRef.current = null;
      }
    }

    setState({
      phase: "needs-login",
      config,
      user: null,
      permissions: [],
      error: null,
    });
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  // ---- Actions ----------------------------------------------------------

  const setConfig = useCallback(async (patch: Partial<AppConfig>) => {
    const next = await window.api.setConfig(patch);
    setBaseUrl(next.backendUrl);
    setState((s) => ({ ...s, config: next }));
    await probe();
  }, [probe]);

  const adoptSession = useCallback(async (sess: SessionInfo) => {
    setToken(sess.token);
    tokenRef.current = sess.token;
    await window.api.saveSession(sess);
    const me = await api.me();
    setState((s) => ({
      ...s,
      phase: "ready",
      user: me.user,
      permissions: me.permissions,
      error: null,
    }));
  }, []);

  const signIn = useCallback(
    async (username: string, pin: string) => {
      const sess = await api.login({ username, pin });
      await adoptSession(sess);
    },
    [adoptSession],
  );

  const runSetup = useCallback(
    async (username: string, pin: string) => {
      const sess = await api.setup({ username, pin });
      await adoptSession(sess);
    },
    [adoptSession],
  );

  const signOut = useCallback(async () => {
    try {
      if (tokenRef.current) await api.logout();
    } catch {
      /* ignore — we're tearing down anyway */
    }
    setToken(null);
    tokenRef.current = null;
    await window.api.saveSession(null);
    setState((s) => ({
      ...s,
      phase: "needs-login",
      user: null,
      permissions: [],
    }));
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      ...state,
      setConfig,
      signIn,
      runSetup,
      signOut,
      reprobe: probe,
    }),
    [state, setConfig, signIn, runSetup, signOut, probe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
