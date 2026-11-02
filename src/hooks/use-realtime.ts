"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Какие запросы обновлять по теме события.
const TOPIC_KEYS: Record<string, string[][]> = {
  applications: [["applications"], ["application"], ["dashboard"], ["report"], ["candidates"], ["candidate"], ["rating"], ["notifications"], ["counters"]],
  registrations: [["registrations"], ["employees"], ["counters"]],
  employees: [["employees"], ["employee"], ["me"], ["leadership"]],
  roles: [["roles"], ["employees"], ["me"]],
  leadership: [["leadership"]],
  deliveries: [["deliveries"], ["leadership"], ["integrations"]],
  settings: [["settings"], ["me"]],
  candidates: [["candidates"], ["candidate"]],
};

/** Подписка на SSE /api/events: инвалидирует кэш TanStack Query при изменениях на сервере. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = new Set<string>();
    const flush = () => {
      for (const topic of pending) for (const key of TOPIC_KEYS[topic] ?? []) qc.invalidateQueries({ queryKey: key });
      pending = new Set();
      timer = null;
    };
    const connect = () => {
      es = new EventSource("/api/events");
      es.addEventListener("update", (e) => {
        try {
          const { topic } = JSON.parse((e as MessageEvent).data) as { topic: string };
          pending.add(topic);
          if (!timer) timer = setTimeout(flush, 300);
        } catch {
          /* игнор */
        }
      });
    };
    connect();
    return () => {
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, qc]);
}
