import type { ItemStatus, QueuedItem } from '../types';

/** Cola en IndexedDB. Un envío que falla por falta de señal se queda aquí
 *  con su imagen y sale solo cuando vuelve la red o se reabre la app. Lo ya
 *  enviado se conserva (con miniatura) para la lista "enviadas". */
const DB = 'pereiramap';
const STORE = 'items';
const KEEP_SENT = 50;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'observation_id' });
      store.createIndex('status', 'status');
      store.createIndex('created_at', 'created_at');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export const putItem = (item: QueuedItem) => tx('readwrite', (s) => s.put(item)).then(() => undefined);
export const getItem = (id: string) => tx<QueuedItem | undefined>('readonly', (s) => s.get(id));
export const allItems = () =>
  tx<QueuedItem[]>('readonly', (s) => s.getAll()).then((items) =>
    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));

export async function setStatus(id: string, status: ItemStatus, patch: Partial<QueuedItem> = {}) {
  const item = await getItem(id);
  if (!item) return;
  await putItem({ ...item, ...patch, status });
}

/** Deja solo las últimas KEEP_SENT enviadas; las pendientes nunca se borran. */
export async function prune() {
  const items = await allItems();
  const sent = items.filter((i) => i.status === 'sent');
  for (const old of sent.slice(KEEP_SENT)) {
    await tx('readwrite', (s) => s.delete(old.observation_id));
  }
}
