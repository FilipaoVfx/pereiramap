import { useMemo } from "react";
import { computeFreshness, FRESHNESS_COLOR } from "../lib/status";
import { useMapStore } from "../store/mapStore";
import { useNow } from "../hooks/useNow";

const ROWS: { key: "LIVE" | "RECENT" | "STALE"; label: string }[] = [
  { key: "LIVE", label: "Reciente (<5 min)" },
  { key: "RECENT", label: "Envejeciendo (<1 h)" },
  { key: "STALE", label: "Antiguo (>1 h)" },
];

export default function CoverageLegend() {
  const observations = useMapStore((s) => s.observations);
  const now = useNow(5000);

  const counts = useMemo(() => {
    const c: Record<string, number> = { LIVE: 0, RECENT: 0, STALE: 0 };
    for (const o of observations) {
      const f = computeFreshness(o.capturedAt, now);
      if (f in c) c[f] += 1;
    }
    return c;
  }, [observations, now]);

  return (
    <div className="pointer-events-auto rounded-xl border border-white/10 bg-ink-900/80 p-3 shadow-glow backdrop-blur">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Cobertura de la ciudad
      </div>
      <div className="space-y-1.5">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: FRESHNESS_COLOR[row.key] }}
              />
              <span className="text-slate-300">{row.label}</span>
            </div>
            <span className="font-mono text-slate-400">{counts[row.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
