import type { Freshness } from "../types";

const LIVE_MS = 5 * 60 * 1000;
const RECENT_MS = 60 * 60 * 1000;

export function computeFreshness(capturedAt: string, now: number = Date.now()): Freshness {
  const ts = new Date(capturedAt).getTime();
  if (Number.isNaN(ts)) return "UNKNOWN";
  const age = now - ts;
  if (age < 0) return "LIVE";
  if (age < LIVE_MS) return "LIVE";
  if (age < RECENT_MS) return "RECENT";
  return "STALE";
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));

  if (diffSec < 5) return "justo ahora";
  if (diffSec < 60) return `hace ${diffSec} s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.round(diffHr / 24);
  return `hace ${diffDay} d`;
}

export const FRESHNESS_COLOR: Record<Freshness, string> = {
  LIVE: "#22e07a",
  RECENT: "#f5b942",
  STALE: "#ef4d4d",
  UNKNOWN: "#5b6472",
};

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  LIVE: "LIVE",
  RECENT: "RECENT",
  STALE: "STALE",
  UNKNOWN: "UNKNOWN",
};
