"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import type { OpArgs, OpName, OpResult, ViewData, ViewName, ViewParams } from "@/server/registry";
import { useNotices } from "./notices";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function getView<N extends ViewName>(name: N, params?: ViewParams<N>): Promise<ViewData<N>> {
  const qs = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : "";
  const res = await fetch(`/api/views/${name}${qs}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({ error: "Unexpected response" }));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(body.error ?? "This couldn't be loaded.", res.status);
  }
  return body.data as ViewData<N>;
}

export async function callOp<N extends OpName>(name: N, args: OpArgs<N>): Promise<OpResult<N>> {
  const res = await fetch(`/api/ops/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  const body = await res.json().catch(() => ({ error: "Unexpected response" }));
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong.", res.status);
  return body.data as OpResult<N>;
}

/**
 * Read a view. Views poll gently so work carried forward by agents, colleagues,
 * and the sandbox shows up without a manual refresh.
 */
export function useView<N extends ViewName>(
  name: N,
  params?: ViewParams<N>,
  options?: Partial<UseQueryOptions<ViewData<N>, ApiError>> & { poll?: number | false },
) {
  const { poll = 4000, ...rest } = options ?? {};
  return useQuery<ViewData<N>, ApiError>({
    queryKey: ["view", name, params ?? {}],
    queryFn: () => getView(name, params),
    refetchInterval: poll === false ? false : poll,
    retry: (count, err) => err.status >= 500 && count < 2,
    ...rest,
  });
}

/**
 * Run an operation. On success every view refetches — the same record appears in
 * several places, so they all need to show its current state.
 */
export function useOp<N extends OpName>(name: N, opts?: { success?: string | ((r: OpResult<N>) => string | null); silent?: boolean }) {
  const qc = useQueryClient();
  const { notify } = useNotices();
  const m = useMutation<OpResult<N>, ApiError, OpArgs<N>>({
    mutationFn: (args) => callOp(name, args),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["view"] });
      const msg = typeof opts?.success === "function" ? opts.success(result) : opts?.success;
      if (msg) notify("success", msg);
    },
    onError: (err) => {
      if (!opts?.silent) notify("error", err.message);
    },
  });
  return m;
}

/** A stable idempotency key per logical send, regenerated after success. */
export function useClientKey() {
  const make = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const [key, setKey] = useState(make);
  const rotate = useCallback(() => setKey(make()), []);
  return [key, rotate] as const;
}

export type { ViewData, OpResult };
