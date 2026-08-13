import { OBSERVATIONS_TABLE, supabase } from "./supabaseClient";
import type { MediaReference } from "../types";
import { getDeviceId } from "./deviceId";

export interface SubmitObservationInput {
  media: MediaReference;
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
}

export async function submitObservation(input: SubmitObservationInput) {
  const point = `SRID=4326;POINT(${input.longitude} ${input.latitude})`;

  const { error } = await supabase.from(OBSERVATIONS_TABLE).insert({
    media: input.media,
    location: point,
    accuracy: input.accuracy ?? null,
    captured_at: input.capturedAt,
    source_id: getDeviceId(),
    status: "LIVE",
  });

  if (error) throw error;
}
