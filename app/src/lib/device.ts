const KEY = 'pereiramap.device_id';

/** Identificador aleatorio de esta instalación. No identifica a una persona
 *  y no sale en la vista pública; sirve para el freno de envíos por hora y
 *  para que el usuario reconozca "mis envíos" sin cuenta. */
export function deviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}
