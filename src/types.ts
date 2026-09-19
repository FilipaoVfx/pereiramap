export type Freshness = "LIVE" | "RECENT" | "STALE" | "UNKNOWN";

export interface MediaReference {
  provider: "cloudinary" | "demo";
  publicId: string;
  secureUrl: string;
  thumbnailUrl?: string;
  resourceType: "image" | "video";
  format: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bytes: number;
}

export interface ObservationRow {
  id: string;
  media: MediaReference;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  captured_at: string;
  received_at: string;
  source_id: string | null;
  status: "LIVE" | "RECENT" | "STALE" | "INVALID";
  incident_id: string | null;
  created_at: string;
}

export interface Observation {
  id: string;
  media: MediaReference;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  capturedAt: string;
  receivedAt: string;
  sourceId?: string;
  incidentId?: string;
}
