"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type IntegrationStatus = {
  appUrl: string;
  googleForms: { configured: boolean; enabled: boolean; endpoint: string; lastEventAt: string | null; last7d: Record<string, number>; fieldMap: Record<string, string[]> };
  vkBot: {
    configured: boolean;
    enabled: boolean;
    callbackConfigured: boolean;
    groupId: string | null;
    endpoint: string;
    lastEventAt: string | null;
    last7d: Record<string, number>;
    deliveries7d: Record<string, number>;
    group: { ok: boolean; name?: string; error?: string } | null;
  };
  vkId: { configured: boolean; redirectUri: string };
};

export function useIntegrationStatus(live = false, enabled = true) {
  return useQuery({
    queryKey: ["integrations", "status", live],
    queryFn: () => api<IntegrationStatus>(`/api/integrations/status${live ? "?live=1" : ""}`),
    enabled,
  });
}

export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className={`size-2 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" : "bg-red-400"}`} />
      {label}
    </span>
  );
}
