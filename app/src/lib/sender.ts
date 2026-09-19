import { sendObservation, uploadImage } from './supabase';
import { allItems, putItem, setStatus } from './queue';
import type { QueuedItem } from '../types';

/** Sube las dos imágenes y registra la observación. Cada paso es idempotente
 *  (409 en la subida = ya estaba; la función devuelve el registro existente),
 *  así que reintentar el mismo item nunca duplica nada. */
export async function deliver(item: QueuedItem): Promise<QueuedItem> {
  const id = item.observation_id;
  try {
    await uploadImage(`${id}/full.jpg`, item.full);
    await uploadImage(`${id}/thumb.jpg`, item.thumb);
    const result = await sendObservation(item.payload);
    const done: QueuedItem = { ...item, status: 'sent', result, last_error: null, attempts: item.attempts + 1 };
    await putItem(done);
    return done;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    /* Un rechazo de la base (fuera de Pereira, sin ubicación) no se cura
       reintentando: queda como fallido y la lista lo dice. La falta de red sí. */
    const permanent = /FUERA_DE_PEREIRA|SIN_UBICACION|fuera de Pereira|no tiene ubicación/i.test(message);
    const failed: QueuedItem = {
      ...item, status: permanent ? 'failed' : 'pending', last_error: message, attempts: item.attempts + 1,
    };
    await putItem(failed);
    return failed;
  }
}

/** Reintenta todo lo pendiente. Se llama al abrir y cuando vuelve la red. */
export async function flush(onChange: () => void): Promise<void> {
  const pending = (await allItems()).filter((i) => i.status === 'pending');
  for (const item of pending) {
    await setStatus(item.observation_id, 'pending');
    await deliver(item);
    onChange();
  }
}
