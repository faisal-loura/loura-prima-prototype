"use client";

import { createContext, useContext } from "react";
import type { ViewData } from "@/lib/api";

export type ShellData = ViewData<"shell">;

export const ShellContext = createContext<ShellData | null>(null);

/** The signed-in member, organization members, and model mode. Null while loading. */
export function useShell() {
  return useContext(ShellContext);
}
