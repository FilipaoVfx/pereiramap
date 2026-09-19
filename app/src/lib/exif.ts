import exifr from 'exifr';
import type { ExifFacts } from '../types';

/** Extrae del EXIF SOLO lo que la observación necesita —dónde, cuándo, hacia
 *  dónde— antes de que la imagen se re-codifique sin metadatos. Marca, modelo,
 *  número de serie, software y demás se quedan en el teléfono.
 *
 *  Sobre la fiabilidad: en iOS Safari la cámara abierta desde la web NO
 *  escribe GPS, y al elegir de la galería el usuario puede quitarlo; en
 *  Android depende de la app de cámara. Por eso es el segundo criterio de
 *  ubicación y no el primero (ver la regla en la migración). */
export async function readExif(file: Blob): Promise<ExifFacts> {
  const facts: ExifFacts = { lon: null, lat: null, captured_at: null, heading_deg: null };
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)
        && !(gps.latitude === 0 && gps.longitude === 0)) {
      facts.lat = gps.latitude;
      facts.lon = gps.longitude;
    }
  } catch { /* sin bloque GPS */ }
  try {
    const tags = (await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal', 'GPSImgDirection'],
      gps: true,
    })) as Record<string, unknown> | undefined;
    if (tags) {
      const when = tags.DateTimeOriginal;
      if (when instanceof Date && !Number.isNaN(when.getTime())) {
        facts.captured_at = when.toISOString();
      }
      const dir = tags.GPSImgDirection;
      if (typeof dir === 'number' && Number.isFinite(dir)) {
        facts.heading_deg = Math.round((((dir % 360) + 360) % 360) * 10) / 10;
      }
    }
  } catch { /* sin EXIF legible */ }
  return facts;
}
