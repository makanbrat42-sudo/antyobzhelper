"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

/** Мутация с toast-уведомлениями и инвалидацией указанных запросов. */
export function useAction<TBody = unknown, TRes = unknown>(opts: {
  url: string | ((body: TBody) => string);
  method?: string;
  success?: string | ((res: TRes) => string);
  invalidate?: string[][];
  onSuccess?: (res: TRes) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) =>
      api<TRes>(typeof opts.url === "function" ? opts.url(body) : opts.url, { method: opts.method ?? "POST", body: body ?? {} }),
    onSuccess: (res) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res) : opts.success);
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: ["counters"] });
      opts.onSuccess?.(res);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
