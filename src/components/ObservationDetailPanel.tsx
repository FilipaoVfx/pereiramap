import { X, MapPin, Clock, Film, ImageIcon, FlaskConical } from "lucide-react";
import { useMapStore } from "../store/mapStore";
import LiveBadge from "./LiveBadge";

export default function ObservationDetailPanel() {
  const selectedId = useMapStore((s) => s.selectedObservationId);
  const observation = useMapStore((s) =>
    s.observations.find((o) => o.id === s.selectedObservationId)
  );
  const selectObservation = useMapStore((s) => s.selectObservation);

  if (!selectedId || !observation) return null;

  const isVideo = observation.media.resourceType === "video";
  const isDemo = observation.media.provider === "demo";

  return (
    <aside className="pointer-events-auto absolute right-3 top-20 z-20 w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 shadow-glow backdrop-blur sm:top-4">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Observación
        </div>
        <button
          onClick={() => selectObservation(null)}
          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative aspect-[4/3] w-full bg-ink-800">
        {isVideo ? (
          <video
            src={observation.media.secureUrl}
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={observation.media.secureUrl}
            alt="Evidencia de la observación"
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ink-950/80 px-2 py-1 text-[10px] text-slate-300">
          {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {observation.media.format.toUpperCase()}
        </div>
        {isDemo && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-1 text-[10px] font-semibold text-ink-950">
            <FlaskConical className="h-3 w-3" />
            DEMO
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <LiveBadge capturedAt={observation.capturedAt} />

        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <MapPin className="h-3.5 w-3.5 text-slate-500" />
          {observation.location.latitude.toFixed(4)}, {observation.location.longitude.toFixed(4)}
          {observation.location.accuracy && (
            <span className="text-slate-500">±{Math.round(observation.location.accuracy)}m</span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          {new Date(observation.capturedAt).toLocaleString("es-CO")}
        </div>

        {isDemo && (
          <p className="rounded-lg bg-white/5 p-2.5 text-[11px] leading-relaxed text-slate-400">
            Evidencia de ejemplo — Cloudinary aún no está configurado. La ubicación, hora y
            transmisión en tiempo real de esta observación son reales.
          </p>
        )}
      </div>
    </aside>
  );
}
