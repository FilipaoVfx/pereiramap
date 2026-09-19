import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, CheckCircle2, Loader2, MapPin, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { uploadEvidence, isCloudinaryConfigured } from "../lib/cloudinary";
import { submitObservation } from "../lib/observations";

type FlowState = "idle" | "locating" | "uploading" | "success" | "error";

function getLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalización no disponible en este navegador"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

export default function Capture() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FlowState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErrorMessage(null);
    setState("locating");
    try {
      const position = await getLocation();
      setState("uploading");
      setProgress(0);

      const media = await uploadEvidence(file, setProgress);

      await submitObservation({
        media,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        capturedAt: new Date().toISOString(),
      });

      setState("success");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Error desconocido");
      setState("error");
    }
  }

  function reset() {
    setState("idle");
    setProgress(0);
    setErrorMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-ink-950 px-6 text-center">
      <Link
        to="/"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Mapa
      </Link>

      {!isCloudinaryConfigured && (
        <div className="absolute top-4 right-4 rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-400">
          Modo demo
        </div>
      )}

      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Pereira · reporte ciudadano
      </div>
      <h1 className="mb-8 text-2xl font-bold text-white">¿Qué está pasando?</h1>

      {state === "idle" && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="group flex h-40 w-40 items-center justify-center rounded-full border-4 border-alert-stale/40 bg-alert-stale/10 transition hover:border-alert-stale hover:bg-alert-stale/20 active:scale-95"
          >
            <Camera className="h-16 w-16 text-alert-stale transition group-hover:scale-110" />
          </button>
          <p className="mt-8 max-w-xs text-sm leading-relaxed text-slate-400">
            Capturas una foto o video. Nosotros tomamos la ubicación y la hora. No necesitas
            escribir nada.
          </p>
        </>
      )}

      {(state === "locating" || state === "uploading") && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-14 w-14 animate-spin text-alert-recent" />
          <div className="text-sm font-medium text-slate-300">
            {state === "locating" ? (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Obteniendo ubicación…
              </span>
            ) : (
              `Enviando evidencia… ${progress}%`
            )}
          </div>
          {state === "uploading" && (
            <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-alert-recent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {state === "success" && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="h-16 w-16 text-alert-live" />
          <div className="text-lg font-semibold text-white">Observación enviada</div>
          <p className="max-w-xs text-sm text-slate-400">
            Ya está visible en el mapa en tiempo real. Gracias por observar tu ciudad.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              onClick={reset}
              className={clsx(
                "rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
              )}
            >
              Reportar otra
            </button>
            <Link
              to="/"
              className="rounded-lg bg-alert-live/90 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-alert-live"
            >
              Ver en el mapa
            </Link>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-4">
          <TriangleAlert className="h-14 w-14 text-alert-stale" />
          <div className="text-sm font-medium text-slate-300">No se pudo enviar el reporte</div>
          <p className="max-w-xs text-xs text-slate-500">{errorMessage}</p>
          <button
            onClick={reset}
            className="rounded-lg bg-alert-stale/90 px-4 py-2 text-sm font-semibold text-white hover:bg-alert-stale"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
