"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PermissionKey } from "@/lib/permissions";

export type SessionUser = {
  id: string;
  vkId: string;
  nickname: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "BLOCKED";
  mainRole: { id: string; key: string; name: string; color: string } | null;
  callerRole: { id: string; key: string; name: string; color: string } | null;
  permissions: PermissionKey[];
};

export type MeResponse = {
  user: SessionUser | null;
  registration: { status: string; createdAt: string; comment: string | null; reviewedAt: string | null } | null;
  setupAvailable: boolean;
  vkConfigured: boolean;
  devLogin: boolean;
  site: {
    name: string;
    logoUrl: string;
    accentColor: string;
    accentColor2: string;
    discordInviteUrl: string;
    timezone: string;
    cooldownHours: number;
  };
};

export function useSession() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/api/auth/me"), staleTime: 60_000 });
  const user = q.data?.user ?? null;
  const can = (p: PermissionKey | PermissionKey[]) => {
    if (!user || user.status !== "ACTIVE") return false;
    const list = Array.isArray(p) ? p : [p];
    return list.some((x) => user.permissions.includes(x));
  };
  return { ...q, me: q.data, user, can };
}
