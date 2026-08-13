import MapView from "../components/MapView";
import TopBar from "../components/TopBar";
import CoverageLegend from "../components/CoverageLegend";
import ObservationDetailPanel from "../components/ObservationDetailPanel";
import { useRealtimeObservations } from "../hooks/useRealtimeObservations";

export default function Dashboard() {
  useRealtimeObservations();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink-950">
      <MapView />
      <TopBar />
      <ObservationDetailPanel />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-3 sm:p-4">
        <CoverageLegend />
        <div className="pointer-events-auto hidden rounded-xl border border-white/10 bg-ink-900/70 px-3 py-2 text-[11px] text-slate-500 backdrop-blur sm:block">
          Pereira, Colombia · Emergencia sísmica (escenario de validación)
        </div>
      </div>
    </div>
  );
}
