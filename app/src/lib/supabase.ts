import { BUCKET, SUPABASE_KEY, SUPABASE_URL } from '../config';
import type { ObservationPayload, SendResult } from '../types';

/** Dos llamadas HTTP a Supabase, sin SDK: subir un objeto al Storage y
 *  llamar a una función por PostgREST. El SDK pesa 120 KB comprimidos y aquí
 *  no aporta nada — no hay sesión, no hay realtime, no hay consultas. La
 *  clave publicable va en las cabeceras: es pública por diseño; lo que
 *  protege es lo que la base permite hacer con ella. */

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
});

/** Sube una imagen a `<observation_id>/<name>.jpg`. Un 409 es éxito: la
 *  subida anterior llegó aunque el cliente no viera la respuesta. */
export async function uploadImage(path: string, blob: Blob): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=31536000' },
    body: blob,
  });
  if (res.ok || res.status === 409) return;
  throw new Error(`subida ${path}: ${await reason(res)}`);
}

export async function sendObservation(payload: ObservationPayload): Promise<SendResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pereiramap_enviar`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p: payload }),
  });
  if (!res.ok) throw new Error(friendly(await reason(res)));
  return (await res.json()) as SendResult;
}

async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string; details?: string };
    return body.message ?? body.error ?? body.details ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Los errores del trigger llegan con su código delante del mensaje. */
function friendly(message: string): string {
  if (message.includes('SIN_UBICACION')) return 'La foto no tiene ubicación. Espera el GPS y reintenta.';
  if (message.includes('FUERA_DE_PEREIRA')) return 'La ubicación queda fuera de Pereira; no se registra.';
  if (message.includes('LIMITE_POR_DISPOSITIVO')) return 'Demasiados envíos en una hora desde este teléfono.';
  return message;
}

export const publicImageUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
