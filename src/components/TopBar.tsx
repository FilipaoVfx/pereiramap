import { Link } from "react-router-dom";
import { Radio, Camera, SatelliteDish } from "lucide-react";
import { useMapStore } from "../store/mapStore";

export default function TopBar() {
  const observations = useMapStore((s) => s.observations);
  const realtimeConnected = useMapStore((s) => s.realtimeConnected);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3 sm:p-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-ink-900/80 px-4 py-2.5 shadow-glow backdrop-blur">
        <SatelliteDish className="h-5 w-5 text-alert-live" />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-white">
            Pereira<span className="text-alert-live">Map</span>
          </div>
          <div className="text-[11px] text-slate-400">Inteligencia situacional en tiempo real</div>
        </div>
        <div className="mx-1 h-8 w-px bg-white/10" />
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <Radio className={realtimeConnected ? "h-3.5 w-3.5 text-alert-live" : "h-3.5 w-3.5 text-alert-stale"} />
          {realtimeConnected ? "En vivo" : "Conectando…"}
        </div>
        <div className="hidden sm:block text-[11px] text-slate-400 font-mono">
          {observations.length} observaciones
        </div>
      </div>

      <Link
        to="/capture"
        className="pointer-events-auto flex items-center gap-2 rounded-xl bg-alert-stale/90 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:bg-alert-stale"
      >
        <Camera className="h-4 w-4" />
        Reportar
      </Link>
    </header>
  );
}
