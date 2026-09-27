"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { OverlayToaster, Position, type Intent, type OverlayToaster as ToasterInstance } from "@blueprintjs/core";

export type Tone = "error" | "success";

interface NoticeApi {
  notify: (tone: Tone, message: string) => void;
}

const TONE: Record<Tone, { intent: Intent; icon: "error" | "tick-circle" }> = {
  error: { intent: "danger", icon: "error" },
  success: { intent: "success", icon: "tick-circle" },
};

/** Transient UI feedback — not server state, so it stays out of the query cache. */
const NoticeContext = createContext<NoticeApi | null>(null);

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const toaster = useRef<ToasterInstance>(null);

  const notify = useCallback((tone: Tone, message: string) => {
    toaster.current?.show({ message, timeout: 5000, ...TONE[tone] });
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NoticeContext.Provider value={value}>
      <OverlayToaster ref={toaster} position={Position.BOTTOM_RIGHT} />
      {children}
    </NoticeContext.Provider>
  );
}

export function useNotices(): NoticeApi {
  const api = useContext(NoticeContext);
  if (!api) throw new Error("useNotices must be used inside <NoticeProvider>");
  return api;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
