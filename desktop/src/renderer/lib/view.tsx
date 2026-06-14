/**
 * Top-level "which pane is showing" state.
 *
 * We don't need react-router — there are only a handful of views and they
 * never need deep links. A context-backed string enum is plenty.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type ViewName = "chat" | "lighting" | "group" | "admin" | "settings" | "profile";

interface ViewCtx {
  view: ViewName;
  setView: (v: ViewName) => void;
}

const Ctx = createContext<ViewCtx | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<ViewName>("chat");
  const value = useMemo(() => ({ view, setView }), [view]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useView(): ViewCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useView must be used inside <ViewProvider>");
  return v;
}
