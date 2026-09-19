import { useEffect } from "react";
import { OBSERVATIONS_TABLE, supabase } from "../lib/supabaseClient";
import { useMapStore } from "../store/mapStore";
import type { Observation, ObservationRow } from "../types";

function rowToObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    media: row.media,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy: row.accuracy ?? undefined,
    },
    capturedAt: row.captured_at,
    receivedAt: row.received_at,
    sourceId: row.source_id ?? undefined,
    incidentId: row.incident_id ?? undefined,
  };
}

const SELECT_COLUMNS =
  "id, media, latitude, longitude, accuracy, captured_at, received_at, source_id, status, incident_id, created_at";

export function useRealtimeObservations() {
  const setObservations = useMapStore((s) => s.setObservations);
  const upsertObservation = useMapStore((s) => s.upsertObservation);
  const setRealtimeConnected = useMapStore((s) => s.setRealtimeConnected);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const { data, error } = await supabase
        .from(OBSERVATIONS_TABLE)
        .select(SELECT_COLUMNS)
        .neq("status", "INVALID")
        .order("captured_at", { ascending: false })
        .limit(500);

      if (cancelled) return;
      if (error) {
        console.error("[realtime] failed to load observations", error);
        return;
      }
      setObservations((data as unknown as ObservationRow[]).map(rowToObservation));
    }

    loadInitial();

    const channel = supabase
      .channel("pm_observations_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: OBSERVATIONS_TABLE },
        (payload) => {
          upsertObservation(rowToObservation(payload.new as unknown as ObservationRow));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: OBSERVATIONS_TABLE },
        (payload) => {
          upsertObservation(rowToObservation(payload.new as unknown as ObservationRow));
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [setObservations, upsertObservation, setRealtimeConnected]);
}
