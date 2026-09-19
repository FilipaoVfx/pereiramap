/** Lo que viaja a `public.pereiramap_enviar(p jsonb)`. Cada clave es una
 *  columna de `pereiramap.observation`; la base resuelve `geom` y
 *  `location_source` con su propia regla. */
export interface ObservationPayload {
  observation_id: string;
  device_id: string;
  app_version: string;
  captured_at: string;
  category: Category | null;
  observed_feature_type: ObservedFeatureType;
  damage_visible: DamageVisibility;
  accessibility: AccessibilityStatus;
  device_lon: number | null;
  device_lat: number | null;
  accuracy_m: number | null;
  device_fix_at: string | null;
  heading_deg: number | null;
  exif_lon: number | null;
  exif_lat: number | null;
  exif_captured_at: string | null;
  exif_heading_deg: number | null;
  manual_lon: number | null;
  manual_lat: number | null;
  image_sha256: string;
  original_sha256: string | null;
  original_bytes: number | null;
  width: number;
  height: number;
}

/** La captura describe una observación física; el matching con una entidad
 * urbana se resuelve después y nunca se inventa desde el GPS del teléfono. */
export type ObservedFeatureType = 'BUILDING' | 'PARCEL' | 'ROAD' | 'PUBLIC_SPACE' | 'UNKNOWN';
export type DamageVisibility = 'YES' | 'NO' | 'UNKNOWN';
export type AccessibilityStatus = 'OPEN' | 'RESTRICTED' | 'BLOCKED' | 'UNKNOWN';

export const FEATURE_TYPES: { key: ObservedFeatureType; label: string }[] = [
  { key: 'BUILDING', label: 'Edificio' },
  { key: 'PARCEL', label: 'Lote' },
  { key: 'ROAD', label: 'Vía' },
  { key: 'PUBLIC_SPACE', label: 'Espacio público' },
  { key: 'UNKNOWN', label: 'No estoy seguro' },
];

export const ACCESSIBILITY: { key: AccessibilityStatus; label: string }[] = [
  { key: 'OPEN', label: 'Accesible' },
  { key: 'RESTRICTED', label: 'Acceso restringido' },
  { key: 'BLOCKED', label: 'Bloqueado' },
  { key: 'UNKNOWN', label: 'No sé' },
];

export type Category =
  | 'COLAPSO'
  | 'DANO_ESTRUCTURAL'
  | 'DANO_LEVE'
  | 'ESCOMBROS'
  | 'VIA_AFECTADA'
  | 'EQUIPAMIENTO_AFECTADO'
  | 'SIN_DANO_VISIBLE'
  | 'OTRO';

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'COLAPSO', label: 'Colapso' },
  { key: 'DANO_ESTRUCTURAL', label: 'Daño estructural' },
  { key: 'DANO_LEVE', label: 'Daño leve' },
  { key: 'ESCOMBROS', label: 'Escombros' },
  { key: 'VIA_AFECTADA', label: 'Vía afectada' },
  { key: 'EQUIPAMIENTO_AFECTADO', label: 'Equipamiento afectado' },
  { key: 'SIN_DANO_VISIBLE', label: 'Sin daño visible' },
  { key: 'OTRO', label: 'Otro' },
];

/** Respuesta de `pereiramap_enviar`. */
export interface SendResult {
  observation_id: string;
  received_at: string;
  location_source: 'DEVICE' | 'EXIF' | 'MANUAL';
  lon: number;
  lat: number;
  exif_device_offset_m: number | null;
  review_status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
}

/** Un fix del Geolocation API, con la hora en que se obtuvo. */
export interface Fix {
  lon: number;
  lat: number;
  accuracy_m: number;
  heading_deg: number | null;
  at: string;
}

/** Lo que se extrae del EXIF ANTES de descartarlo. Nada más se conserva. */
export interface ExifFacts {
  lon: number | null;
  lat: number | null;
  captured_at: string | null;
  heading_deg: number | null;
}

export type ItemStatus = 'pending' | 'sent' | 'failed';

/** Un envío, en el teléfono. Vive en IndexedDB hasta que sale, y después
 *  como recuerdo de lo enviado (con la miniatura, para la lista). */
export interface QueuedItem {
  observation_id: string;
  payload: ObservationPayload;
  full: Blob;
  thumb: Blob;
  status: ItemStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  result: SendResult | null;
}
