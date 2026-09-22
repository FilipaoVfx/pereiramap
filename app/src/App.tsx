import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCURACY_WARN_M, APP_VERSION, BUILD_COMMIT, CONSENT_TEXT, configOk, missingConfig } from './config';
import { deviceId } from './lib/device';
import { readExif } from './lib/exif';
import { distanceM, watchPosition } from './lib/geo';
import { encode, sha256 } from './lib/image';
import { allItems, prune, putItem } from './lib/queue';
import { deliver, flush } from './lib/sender';
import { ACCESSIBILITY, CATEGORIES, FEATURE_TYPES, type AccessibilityStatus, type Category, type DamageVisibility, type ExifFacts, type Fix, type ObservedFeatureType, type ObservationPayload, type QueuedItem } from './types';

/** El flujo entero: abrir → disparar → (mirar dónde y cuándo) → enviar.
 *  Tres pantallas y ningún formulario. La ubicación se vigila desde que la
 *  app abre para que el fix ya exista cuando llegue la foto. */

type Stage =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'review'; draft: Draft }
  | { kind: 'sending'; draft: Draft }
  | { kind: 'done'; item: QueuedItem };

interface Draft {
  observation_id: string;
  previewUrl: string;
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  image_sha256: string;
  original_sha256: string;
  original_bytes: number;
  captured_at: string;      // reloj del teléfono al elegir/tomar la foto
  fixAtCapture: Fix | null; // el mejor fix disponible en ese instante
  exif: ExifFacts;
  category: Category | null;
  observed_feature_type: ObservedFeatureType;
  damage_visible: DamageVisibility;
  accessibility: AccessibilityStatus;
}

export function App() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [items, setItems] = useState<QueuedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fixRef = useRef<Fix | null>(null);

  const refresh = useCallback(() => { allItems().then(setItems).catch(() => setItems([])); }, []);

  useEffect(() => {
    const stop = watchPosition((f) => { fixRef.current = f; setFix(f); setGeoError(null); }, setGeoError);
    return stop;
  }, []);

  useEffect(() => {
    if (!configOk()) return;
    prune().then(refresh).catch(refresh);
    const onOnline = () => { flush(refresh).catch(() => undefined); };
    flush(refresh).catch(() => undefined);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage({ kind: 'preparing' });
    const captured_at = new Date().toISOString();
    const fixAtCapture = fixRef.current;
    try {
      const [exif, encoded, original_sha256] = await Promise.all([readExif(file), encode(file), sha256(file)]);
      const image_sha256 = await sha256(encoded.full);
      setStage({
        kind: 'review',
        draft: {
          observation_id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(encoded.full),
          full: encoded.full, thumb: encoded.thumb, width: encoded.width, height: encoded.height,
          image_sha256, original_sha256, original_bytes: file.size,
          captured_at, fixAtCapture, exif, category: null,
          observed_feature_type: 'UNKNOWN', damage_visible: 'UNKNOWN', accessibility: 'UNKNOWN',
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage({ kind: 'idle' });
    }
  };

  const send = async (draft: Draft) => {
    /* Si al disparar no había fix pero ya llegó uno, se usa ese: el usuario
       sigue en el sitio. La hora del fix viaja para que se pueda auditar. */
    const f = draft.fixAtCapture ?? fixRef.current;
    const payload: ObservationPayload = {
      observation_id: draft.observation_id,
      device_id: deviceId(),
      app_version: APP_VERSION,
      captured_at: draft.captured_at,
      category: draft.category,
      observed_feature_type: draft.observed_feature_type,
      damage_visible: draft.damage_visible,
      accessibility: draft.accessibility,
      device_lon: f?.lon ?? null, device_lat: f?.lat ?? null,
      accuracy_m: f?.accuracy_m ?? null, device_fix_at: f?.at ?? null, heading_deg: f?.heading_deg ?? null,
      exif_lon: draft.exif.lon, exif_lat: draft.exif.lat,
      exif_captured_at: draft.exif.captured_at, exif_heading_deg: draft.exif.heading_deg,
      manual_lon: null, manual_lat: null,
      image_sha256: draft.image_sha256, original_sha256: draft.original_sha256,
      original_bytes: draft.original_bytes, width: draft.width, height: draft.height,
    };
    const item: QueuedItem = {
      observation_id: draft.observation_id, payload, full: draft.full, thumb: draft.thumb,
      status: 'pending', attempts: 0, last_error: null, created_at: new Date().toISOString(), result: null,
    };
    setStage({ kind: 'sending', draft });
    await putItem(item);           // primero al teléfono: si la red falla, no se pierde
    const outcome = await deliver(item);
    URL.revokeObjectURL(draft.previewUrl);
    refresh();
    setStage({ kind: 'done', item: outcome });
  };

  if (!configOk()) {
    return (
      <div className="app">
        <Header />
        <div className="hero">
          <p className="err">Falta configurar: {missingConfig().join(' y ')}.</p>
          <p>Build: {BUILD_COMMIT}. Agrega las variables en el entorno de este deployment y redepliega.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      {stage.kind === 'idle' && (
        <>
          <div className="hero">
            <label className="shutter" aria-label="Tomar foto">
              <input type="file" accept="image/*" capture="environment"
                     onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
              <CameraIcon />
            </label>
            <div className="shutter-label">Tomar foto</div>
            <p>Acércate al lugar afectado, toma la foto y envíala. Sin cuentas ni formularios.</p>
            <GpsStatus fix={fix} error={geoError} />
            {error && <p className="err">{error}</p>}
          </div>
          <SentList items={items} />
        </>
      )}
      {stage.kind === 'preparing' && (
        <div className="hero"><div className="status"><span className="dot pulse" />Leyendo la foto…</div></div>
      )}
      {(stage.kind === 'review' || stage.kind === 'sending') && (
        <Review draft={stage.draft} liveFix={fix} sending={stage.kind === 'sending'}
                onCategory={(c) => setStage({ kind: 'review', draft: { ...stage.draft, category: c } })}
                onFeature={(v) => setStage({ kind: 'review', draft: { ...stage.draft, observed_feature_type: v } })}
                onDamage={(v) => setStage({ kind: 'review', draft: { ...stage.draft, damage_visible: v } })}
                onAccessibility={(v) => setStage({ kind: 'review', draft: { ...stage.draft, accessibility: v } })}
                onSend={() => send(stage.draft)}
                onDiscard={() => { URL.revokeObjectURL(stage.draft.previewUrl); setStage({ kind: 'idle' }); }} />
      )}
      {stage.kind === 'done' && (
        <>
          <Done item={stage.item} />
          <div className="actions">
            <button className="btn primary" onClick={() => setStage({ kind: 'idle' })}>Otra foto</button>
          </div>
          <SentList items={items} />
        </>
      )}
      <footer>
        pereiramap v{APP_VERSION} · alimenta{' '}
        <a href="https://github.com/FilipaoVfx/rebuild" target="_blank" rel="noreferrer">Urban Recovery Intelligence</a>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header>
      <h1><span>pereira</span>map</h1>
      <small>Pereira · sismo 10-08-2026</small>
    </header>
  );
}

function GpsStatus({ fix, error }: { fix: Fix | null; error: string | null }) {
  if (error && !fix) return <div className="status"><span className="dot bad" />{error}</div>;
  if (!fix) return <div className="status"><span className="dot pulse" />Buscando ubicación…</div>;
  const cls = fix.accuracy_m <= 25 ? 'ok' : fix.accuracy_m <= ACCURACY_WARN_M ? 'warn' : 'bad';
  return (
    <div className="status">
      <span className={`dot ${cls}`} />
      Ubicación lista · ±{Math.round(fix.accuracy_m)} m
    </div>
  );
}

function Review({ draft, liveFix, sending, onCategory, onFeature, onDamage, onAccessibility, onSend, onDiscard }: {
  draft: Draft; liveFix: Fix | null; sending: boolean;
  onCategory: (c: Category | null) => void;
  onFeature: (v: ObservedFeatureType) => void;
  onDamage: (v: DamageVisibility) => void;
  onAccessibility: (v: AccessibilityStatus) => void;
  onSend: () => void; onDiscard: () => void;
}) {
  const f = draft.fixAtCapture ?? liveFix;
  const hasExifGps = draft.exif.lon !== null && draft.exif.lat !== null;
  const offset = f && hasExifGps ? distanceM(f.lon, f.lat, draft.exif.lon!, draft.exif.lat!) : null;
  const canSend = !sending && (f !== null || hasExifGps);
  const accCls = !f ? 'bad' : f.accuracy_m <= 25 ? 'ok' : f.accuracy_m <= ACCURACY_WARN_M ? 'warn' : 'bad';

  return (
    <>
      <div className="preview"><img src={draft.previewUrl} alt="Foto tomada" /></div>
      <div className="facts">
        <div className="fact">
          <b>Ubicación</b>
          <span className={`v ${accCls}`}>
            {f ? `${f.lat.toFixed(5)}, ${f.lon.toFixed(5)} · ±${Math.round(f.accuracy_m)} m`
               : hasExifGps ? 'solo la de la foto (EXIF)' : 'esperando GPS…'}
          </span>
        </div>
        <div className="fact">
          <b>Hora</b>
          <span className="v">{hora(draft.captured_at)}{draft.exif.captured_at && draft.exif.captured_at !== draft.captured_at
            ? ` · foto ${hora(draft.exif.captured_at)}` : ''}</span>
        </div>
        <div className="fact">
          <b>GPS en la foto</b>
          <span className={`v ${hasExifGps ? (offset !== null && offset > 50 ? 'warn' : 'ok') : ''}`}>
            {hasExifGps ? (offset !== null ? `sí · a ${Math.round(offset)} m del teléfono` : 'sí') : 'no (normal en la cámara web)'}
          </span>
        </div>
        <div className="fact">
          <b>Imagen</b>
          <span className="v">{draft.width}×{draft.height} · {(draft.full.size / 1024).toFixed(0)} KB · sin metadatos</span>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Qué se ve (opcional)">
        {CATEGORIES.map((c) => (
          <button key={c.key} className="chip" aria-pressed={draft.category === c.key}
                  onClick={() => onCategory(draft.category === c.key ? null : c.key)}>{c.label}</button>
        ))}
      </div>

      <div className="observation-fields" aria-label="Observación estructurada">
        <fieldset>
          <legend>¿Qué estás observando?</legend>
          <div className="chips">
            {FEATURE_TYPES.map((v) => <button type="button" key={v.key} className="chip"
              aria-pressed={draft.observed_feature_type === v.key} onClick={() => onFeature(v.key)}>{v.label}</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>¿Hay daño visible?</legend>
          <div className="chips">
            {(['YES', 'NO', 'UNKNOWN'] as DamageVisibility[]).map((v) => <button type="button" key={v} className="chip"
              aria-pressed={draft.damage_visible === v} onClick={() => onDamage(v)}>{v === 'YES' ? 'Sí' : v === 'NO' ? 'No' : 'No sé'}</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Accesibilidad del lugar</legend>
          <div className="chips">
            {ACCESSIBILITY.map((v) => <button type="button" key={v.key} className="chip"
              aria-pressed={draft.accessibility === v.key} onClick={() => onAccessibility(v.key)}>{v.label}</button>)}
          </div>
        </fieldset>
        <p className="match-note"><span className="dot" /> La entidad urbana se asociará después mediante <b>spatial match</b>. Esta captura queda como observación verificable.</p>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={!canSend} onClick={onSend}>
          {sending ? 'Enviando…' : f || hasExifGps ? 'Enviar' : 'Esperando ubicación…'}
        </button>
        <button className="btn ghost" disabled={sending} onClick={onDiscard}>Descartar</button>
        <p className="consent">{CONSENT_TEXT}</p>
      </div>
    </>
  );
}

function Done({ item }: { item: QueuedItem }) {
  if (item.status === 'sent') {
    return (
      <div className="done">
        <div className="big">✓</div>
        <p><b>Enviada.</b> {item.result?.location_source === 'EXIF' ? 'Ubicada con el GPS de la foto.' : 'Ubicada con el GPS del teléfono.'}</p>
        <p>Pasa a revisión antes de aparecer en Urban Recovery.</p>
      </div>
    );
  }
  if (item.status === 'pending') {
    return (
      <div className="done">
        <div className="big" style={{ color: 'var(--warn)' }}>⏳</div>
        <p><b>Guardada en el teléfono.</b> Se enviará sola cuando haya señal.</p>
        {item.last_error && <p className="err">{item.last_error}</p>}
      </div>
    );
  }
  return (
    <div className="done">
      <div className="big" style={{ color: 'var(--bad)' }}>✕</div>
      <p><b>No se registró.</b></p>
      {item.last_error && <p className="err">{item.last_error}</p>}
    </div>
  );
}

function SentList({ items }: { items: QueuedItem[] }) {
  if (!items.length) return null;
  return (
    <section className="sent">
      <h2>Tus envíos</h2>
      <ul>
        {items.map((i) => <SentRow key={i.observation_id} item={i} />)}
      </ul>
    </section>
  );
}

function SentRow({ item }: { item: QueuedItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(item.thumb);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [item.thumb]);
  const label = item.status === 'sent' ? 'enviada' : item.status === 'pending' ? 'pendiente' : 'rechazada';
  return (
    <li>
      {url ? <img src={url} alt="" /> : <span />}
      <div className="meta">
        <b>{hora(item.payload.captured_at)}</b>
        {CATEGORIES.find((c) => c.key === item.payload.category)?.label ?? 'sin categoría'}
        {item.status !== 'sent' && item.last_error ? ` · ${item.last_error}` : ''}
      </div>
      <span className={`tag ${item.status}`}>{label}</span>
    </li>
  );
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6l1.2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8L9 3zm3 5.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" />
    </svg>
  );
}
