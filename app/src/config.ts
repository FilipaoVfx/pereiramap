export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? '';
export const BUCKET = 'field-photos';
export const APP_VERSION = __APP_VERSION__;

/** Lado mayor de la imagen que se sube y de la miniatura. 2048 px alcanza
 *  para leer una grieta en pantalla y pesa ~0,5 MB; el original se queda en
 *  el teléfono. */
export const MAX_SIDE = 2048;
export const THUMB_SIDE = 480;
export const JPEG_QUALITY = 0.86;

/** Un fix con más error que esto se manda igual, pero la pantalla lo dice en
 *  rojo y la base lo registra: la regla de resolución prefiere el EXIF. */
export const ACCURACY_WARN_M = 100;

/** Texto que el usuario acepta al enviar. Urban Recovery lo archiva literal
 *  en db/terms/pereiramap_20260918.txt: si cambia aquí, cambia allá. */
export const CONSENT_TEXT =
  'Al enviar, autorizas a publicar esta foto y su ubicación bajo licencia CC BY 4.0 ' +
  'como evidencia de campo en Urban Recovery Intelligence. La foto se sube sin metadatos ' +
  'del dispositivo. No fotografíes personas, placas ni números de casa.';

export const configOk = () => SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 20;
