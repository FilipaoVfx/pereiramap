import type { Fix } from '../types';

/** Vigila la posición desde que la app abre: el permiso se pide una vez y el
 *  fix ya está caliente cuando llega la foto. Devuelve la función para parar. */
export function watchPosition(onFix: (fix: Fix) => void, onError: (msg: string) => void): () => void {
  if (!('geolocation' in navigator)) {
    onError('Este navegador no da acceso a la ubicación.');
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onFix({
        lon: pos.coords.longitude,
        lat: pos.coords.latitude,
        accuracy_m: Math.round(pos.coords.accuracy * 10) / 10,
        heading_deg:
          pos.coords.heading !== null && !Number.isNaN(pos.coords.heading)
            ? Math.round((pos.coords.heading % 360) * 10) / 10
            : null,
        at: new Date(pos.timestamp).toISOString(),
      });
    },
    (err) => {
      onError(
        err.code === err.PERMISSION_DENIED
          ? 'Sin permiso de ubicación. Actívalo en el navegador para enviar.'
          : err.code === err.TIMEOUT
            ? 'El GPS no responde. Sal a cielo abierto y espera.'
            : 'No se pudo obtener la ubicación.',
      );
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

const R = 6371008.8;
export function distanceM(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
