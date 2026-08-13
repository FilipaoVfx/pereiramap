# PRD — Plataforma de Inteligencia Situacional en Tiempo Real

Versión: 0.2
Estado: Draft técnico
Caso de uso inicial: Emergencia sísmica — Pereira, Colombia
Objetivo: MVP funcional + arquitectura escalable
Stack de plataforma: **Cloudinary** (evidencia) + **Supabase** (estado, auth, realtime)

---

## 1. Resumen

Construir una plataforma de observación urbana distribuida en tiempo real que permita
transformar las cámaras de ciudadanos que recorren la ciudad en una fuente
georreferenciada de información.

El sistema recibe principalmente:

- 📷 Foto o video
- 📍 Location
- 🕐 Time

A partir de esta información se construye un modelo dinámico del estado de la ciudad.

El ciudadano no debe diligenciar formularios ni clasificar manualmente el incidente.

La plataforma debe encargarse posteriormente de analizar la evidencia, agrupar
observaciones relacionadas y construir información operacional.

### Concepto central

«Cada ciudadano es un sensor. Cada captura es una observación. Cada observación
actualiza el estado de la ciudad.»

---

## 2. Problema

Durante una emergencia de gran escala existe información distribuida entre:

- organismos de socorro;
- autoridades;
- hospitales;
- ciudadanos;
- redes sociales;
- medios;
- comunicaciones internas;
- reportes de campo.

El problema no es únicamente la ausencia de información.

El problema es:

- información fragmentada;
- información duplicada;
- información sin ubicación precisa;
- información desactualizada;
- ausencia de evidencia;
- dificultad para conocer el estado actual de cada punto;
- dificultad para detectar zonas sin información;
- dificultad para reconstruir la evolución temporal de un incidente.

La plataforma busca construir una radiografía operacional viva de la ciudad.

---

## 3. Objetivo principal

Crear un sistema capaz de responder:

«¿Qué está pasando ahora mismo, dónde está pasando y qué evidencia tenemos?»

Y posteriormente:

«¿Cómo ha evolucionado cada situación y qué zonas necesitan ser observadas?»

---

## 4. Principios del producto

### 4.1 Zero-friction reporting

El ciudadano debe poder reportar prácticamente sin interacción.

Flujo ideal:

```
Abrir cámara
    ↓
Capturar
    ↓
Enviar
```

El sistema obtiene automáticamente:

```
MEDIA
LOCATION
TIME
```

No se requiere:

- descripción;
- categoría;
- formulario;
- selección de severidad;
- selección de ubicación manual.

### 4.2 Evidence first

La fotografía/video constituye la evidencia primaria.

La interpretación es secundaria.

```
Evidence
   ↓
Observation
   ↓
Analysis
   ↓
Incident
```

### 4.3 Location + Time

La unidad mínima de contexto es:

```json
{
  "location": {
    "latitude": 4.813,
    "longitude": -75.696
  },
  "time": "2026-08-13T05:31:42Z"
}
```

La plataforma debe conservar:

- coordenadas;
- precisión GPS;
- timestamp de captura;
- timestamp de recepción.

### 4.4 Live by default

La información debe mostrar claramente su frescura.

Estados:

```
LIVE
RECENT
STALE
UNKNOWN
```

Ejemplo:

```
● LIVE
12 seconds ago
```

o:

```
● STALE
47 minutes ago
```

---

## 5. Arquitectura conceptual

```
                  CITIZEN
                     │
               Camera Capture
                     │
              Location + Time
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
      CLOUDINARY             SUPABASE
   (upload directo)       (insert row: obs)
          │                     │
          └──────────┬──────────┘
                     ▼
                OBSERVATION
                     │
                     ▼
                AI ANALYSIS
             (Edge Function)
                     │
                     ▼
             SEMANTIC DATA
                     │
             ┌───────┴───────┐
             ▼               ▼
          INCIDENT        COVERAGE
             │               │
             └───────┬───────┘
                     ▼
             SITUATIONAL MODEL
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       MAP        GRAPH      TIMELINE
```

### 5.1 Roles de Cloudinary y Supabase

La plataforma se apoya en dos servicios administrados con responsabilidades
claramente separadas. No se construye un backend custom para el MVP: la lógica de
servidor puntual que sí se necesita vive en **Supabase Edge Functions** (Deno).

**Cloudinary — capa de evidencia**

- Recibe el upload de foto/video **directamente desde el cliente** (el binario nunca
  pasa por nuestra base de datos ni por un servidor propio).
- Genera automáticamente derivados: thumbnail, versión optimizada para mapa,
  compresión adaptativa, formato moderno (WebP/AVIF/MP4 optimizado).
- CDN global para servir la evidencia con baja latencia.
- Add-ons opcionales de moderación / IA (detección de contenido inapropiado,
  duplicados por hash perceptual).
- Emite un webhook de notificación cuando termina de procesar un asset.

**Supabase — capa de estado estructurado**

- **Postgres + PostGIS**: única fuente de verdad para `observations`, `incidents`,
  `observation_analysis` y la geometría espacial.
- **Auth**: sesiones (anónimas para ciudadanos, autenticadas para operadores).
- **Row Level Security (RLS)**: control de acceso a nivel de fila, sustituye buena
  parte de lo que normalmente haría una capa de autorización en un backend custom.
- **Realtime**: transmite cambios de la base de datos (`postgres_changes`) a los
  clientes suscritos, sin necesidad de un servidor WebSocket propio.
- **Edge Functions**: lógica server-side puntual (firmar uploads de Cloudinary,
  recibir su webhook, orquestar análisis IA, recomputar cobertura).
- **Database Webhooks + pg_cron**: disparan Edge Functions ante cambios en las
  tablas o en intervalos programados.

En una frase: **Cloudinary guarda y transforma la evidencia; Supabase guarda,
protege y transmite el estado de la ciudad.**

---

## 6. Modelo de dominio

### 6.1 Observation

La entidad fundamental del sistema.

```typescript
interface Observation {
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

  status:
    | "LIVE"
    | "RECENT"
    | "STALE"
    | "INVALID";

  analysis?: ObservationAnalysis;

  incidentId?: string;
}

interface MediaReference {
  provider: "cloudinary";
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
```

---

## 7. Media

La plataforma soporta inicialmente:

- JPEG;
- PNG;
- WebP;
- MP4.

**Toda la evidencia (foto/video) se almacena en Cloudinary, no en Supabase.**
Postgres solo guarda la referencia (`MediaReference`) descrita en la sección 6.1.

Flujo de subida:

```
Client
  │
  ▼
Supabase Edge Function: cloudinary-sign
  │  (genera signature + upload preset de corta duración,
  │   scoping por timestamp y carpeta)
  ▼
Client → Cloudinary (upload directo, signed)
  │
  ▼
Cloudinary procesa: thumbnail, formato optimizado, eager transforms
  │
  ▼
Client recibe { public_id, secure_url, ... } y hace
INSERT en Supabase (observations) con MediaReference + location + time
```

Ventajas de este flujo:

- El binario nunca transita por nuestro backend → menor latencia y costo.
- Cloudinary se encarga de compresión, formato adaptativo y CDN.
- El upload firmado evita subidas arbitrarias/abuso del preset.

```
Observation
    │
    └── media (Cloudinary MediaReference)
            ↓
       Cloudinary CDN
```

---

## 8. Location

La ubicación se almacena mediante **PostGIS**, habilitado como extensión dentro del
proyecto de **Supabase**:

```sql
create extension if not exists postgis;

alter table observations
  add column location geography(Point, 4326) not null;

create index observations_location_gix
  on observations using gist (location);
```

Esto permite consultas:

```
Observaciones cercanas
Observaciones dentro de un área
Distancia entre incidentes
Cobertura
Clusters espaciales
Zonas sin observación
```

El acceso a esta tabla está protegido por **Row Level Security**: por ejemplo,
cualquier sesión anónima puede `INSERT`, pero solo puede `SELECT` según las
políticas definidas para el rol `citizen` u `operator`.

---

## 9. Time

Cada `Observation` debe contener como mínimo:

```
captured_at
received_at
```

Esto permite diferenciar:

```
captura:
08:41:32

recepción:
08:41:35
```

La plataforma nunca debe asumir que el timestamp de recepción representa el momento
real de la observación.

---

## 10. Observation Analysis

La interpretación de la evidencia se genera de forma asíncrona, orquestada por una
Supabase Edge Function que invoca el(los) servicio(s) de IA correspondientes (visión
artificial propia, un proveedor externo, o los add-ons de análisis de Cloudinary).

Ejemplo:

```json
{
  "objects": [
    {
      "type": "building",
      "condition": "partial_collapse",
      "confidence": 0.91
    },
    {
      "type": "road",
      "condition": "blocked",
      "confidence": 0.96
    }
  ]
}
```

El análisis puede evolucionar posteriormente hacia:

- daños estructurales;
- vías bloqueadas;
- vehículos;
- incendios;
- inundaciones;
- derrumbes;
- infraestructura;
- personas;
- señales de emergencia.

---

## 11. Incident

Varias observaciones pueden representar el mismo incidente.

```
Observation A
Observation B
Observation C
      │
      ▼
Incident #382
```

Ejemplo:

```typescript
interface Incident {
  id: string;

  location: GeoPoint;

  firstObservedAt: string;
  lastObservedAt: string;

  observationCount: number;

  status:
    | "ACTIVE"
    | "RESOLVED"
    | "STALE"
    | "UNKNOWN";

  severity?: string;

  observations: string[];
}
```

La creación automática de `Incident` será una etapa posterior del MVP, ejecutada
como un job periódico (pg_cron → Edge Function) que agrupa observaciones cercanas en
espacio/tiempo.

---

## 12. Realtime

El sistema soporta actualizaciones en tiempo real usando **Supabase Realtime**
(`postgres_changes`), sin necesidad de un servidor WebSocket propio.

Flujo:

```
Citizen
   ↓
Cloudinary (upload de evidencia)
   ↓
Supabase (INSERT en observations)
   ↓
Postgres logical replication
   ↓
Supabase Realtime (postgres_changes)
   ↓
Clientes suscritos (channel)
   ↓
Map
```

Una nueva observación debe aparecer sin necesidad de recargar la página, apenas se
completa el `INSERT` en la base de datos.

---

## 13. Map Engine

### Tecnología principal

**MapLibre GL JS**

Responsabilidades:

- mapa base;
- navegación;
- zoom;
- pan;
- rotation;
- pitch;
- vector tiles;
- estilos;
- labels;
- edificios;
- calles;
- límites geográficos.

---

## 14. Visualization Engine

### Tecnología principal

**deck.gl**

Responsabilidades:

- observations;
- clusters;
- heatmaps;
- paths;
- trajectories;
- density;
- overlays;
- grandes volúmenes de datos;
- interacción con elementos.

Arquitectura:

```
                MAP
                 │
          MapLibre GL JS
                 │
       ┌─────────┴─────────┐
       │                   │
   Base layers         Data layers
                           │
                        deck.gl
```

---

## 15. Capas del mapa

El mapa debe poder activar/desactivar capas.

**Base**

```
Roads
Buildings
Labels
Boundaries
Terrain
```

**Operational**

```
Observations
Incidents
Coverage
Blocked roads
Critical areas
Emergency resources
```

**Analytical**

```
Heatmap
Density
Trajectories
Historical observations
Temporal evolution
```

---

## 16. Semantic Zoom

La representación cambia dependiendo del nivel de zoom.

**Zoom bajo** — agregaciones:

```
🔴 248
🟠 137
🟡 82
```

**Zoom medio** — clusters.

**Zoom alto** — observaciones individuales:

```
📍
Observation #8214
08:42
```

**Zoom máximo** — evidencia (thumbnail servido desde Cloudinary CDN):

```
📷
Video
Timestamp
Location
```

---

## 17. Clustering

Nunca se deben renderizar miles de markers HTML individuales.

El sistema debe utilizar:

- GPU rendering;
- clustering;
- aggregation;
- vector tiles;
- deck.gl layers.

Objetivo:

«Mantener una experiencia fluida incluso con grandes cantidades de observaciones.»

---

## 18. Realtime Layer

Las observaciones nuevas (recibidas vía Supabase Realtime) deben tener una
representación visual diferenciada.

```
       ✦
      ╱ ╲
     ╱   ╲
    📍
```

Una nueva observación puede aparecer con una pequeña animación para comunicar:

«Esto acaba de ocurrir.»

---

## 19. Observation Detail Panel

Al seleccionar una observación (media servida desde Cloudinary, resto desde Supabase):

```
┌───────────────────────────────┐
│ OBSERVATION                   │
│                               │
│      MEDIA (Cloudinary)       │
│                               │
│ 📍 4.8133, -75.6961           │
│ 🕐 08:42:13                   │
│                               │
│ LIVE ●                        │
│                               │
│ ───────────────────────────   │
│                               │
│ Evidence                      │
│                               │
│ [View media]                  │
│ [View incident]               │
└───────────────────────────────┘
```

---

## 20. Coverage Intelligence

Una funcionalidad crítica.

El sistema debe diferenciar:

**Sin información**

```
UNKNOWN
```

de:

**Información reciente indicando normalidad**

```
OBSERVED / NO INCIDENT
```

y:

**Información antigua**

```
STALE
```

Esto permite construir un Coverage Map.

---

## 21. Coverage Map

Ejemplo:

```
          CITY

     🟢🟢🟢🟢
   🟢🟢🟢🟢🟢
   🟢🟢🟡🟡
      🔴🔴
```

```
🟢 recently observed
🟡 aging information
🔴 critical observations
⚪ no information
```

Esto permite detectar:

«¿Dónde no sabemos qué está pasando?»

---

## 22. Temporal Layer

El sistema debe permitir navegar por el tiempo.

Ejemplo:

```
08:00 ─── 09:00 ─── 10:00 ─── 11:00 ─── NOW
             ▲
             │
         timeline
```

Al mover el timeline:

- aparecen/desaparecen observaciones;
- cambian clusters;
- evolucionan incidentes;
- cambia la cobertura.

---

## 23. ThemeRiver

Para representar la evolución de categorías o eventos.

Ejemplo conceptual:

```
08:00
          ███
       █████████
    █████████████
──────────────────────────
08:00       09:00       NOW
```

Podrá representar:

- número de observaciones;
- incidentes;
- daños;
- vías bloqueadas;
- rescates;
- categorías detectadas.

No es obligatorio para el primer MVP.

---

## 24. Graph Layer

La plataforma debe quedar preparada para representar relaciones:

```
Observation
     │
     ▼
Incident
     │
 ┌───┼────┐
 ▼   ▼    ▼
Road Building Hospital
```

El graph puede implementarse inicialmente mediante relaciones (foreign keys) en el
mismo Postgres de Supabase.

No introducir una base de datos de grafos hasta que exista un caso de uso real que lo
justifique.

---

## 25. Frontend

### Stack recomendado

```
React
TypeScript
Vite
MapLibre GL JS
deck.gl
Zustand
Tailwind CSS
@supabase/supabase-js
```

El frontend debe estar diseñado como una aplicación operacional, no como una landing
page.

---

## 26. Estado global

Zustand puede administrar:

```typescript
interface MapState {
  viewport: Viewport;

  observations: Observation[];

  selectedObservation?: string;

  selectedIncident?: string;

  activeLayers: string[];

  timeRange: {
    from: Date;
    to: Date;
  };

  realtime: boolean;
}
```

---

## 27. Backend

No se construye un backend custom (Go/Node) para el MVP. La plataforma es
**Supabase-first**:

```
Supabase
├── Postgres + PostGIS         (estado espacial)
├── PostgREST                  (REST autogenerado sobre las tablas, con RLS)
├── Auth                       (sesiones anónimas/operador)
├── Realtime                   (postgres_changes → clientes)
├── Edge Functions (Deno)      (lógica server-side puntual)
├── Database Webhooks          (triggers → Edge Functions)
└── pg_cron                    (jobs periódicos)
```

Las Edge Functions cubren la lógica que sí necesita ejecutarse en el servidor:

- `cloudinary-sign`: emite parámetros/firma de upload de corta duración.
- `cloudinary-webhook`: recibe la notificación de Cloudinary al terminar de procesar
  un asset y actualiza el registro correspondiente.
- `analyze-observation`: orquesta el análisis de IA sobre una observación.
- `recompute-coverage` / `resolve-incidents`: jobs invocados por pg_cron.

Si más adelante el procesamiento pesado (IA, clustering de incidentes a gran escala)
supera lo que Edge Functions puede sostener, se puede introducir un worker dedicado
(Go o Node) que consuma eventos desde Supabase — pero no es parte del MVP.

---

## 28. Database

**PostgreSQL + PostGIS**, hosteado dentro del proyecto de **Supabase**.

Tablas iniciales:

```
users
observations
media               -- referencias a Cloudinary, no binarios
incidents
observation_analysis
```

Índices:

```
GIST(location)
BTREE(captured_at)
BTREE(status)
```

Cada tabla tiene **Row Level Security (RLS) habilitado**, con políticas explícitas
por rol (`citizen`, `operator`, `service_role` para las Edge Functions).

---

## 29. Vector Tiles

Los datos históricos no deben enviarse como un único JSON gigante.

Arquitectura:

```
PostGIS (Supabase)
   ↓
ST_AsMVT (generación de tiles)
   ↓
Edge Function programada (pg_cron)
   ↓
MVT
   ↓
MapLibre
```

Opcionalmente:

**PMTiles** para datasets históricos estáticos, servidos como archivo estático (p.
ej. desde Cloudinary o Supabase Storage) sin necesidad de un tile-server dedicado
hasta que el volumen lo justifique.

---

## 30. Realtime vs Historical

Separar claramente ambos caminos.

```
                DATA
                 │
        ┌────────┴─────────┐
        │                  │
       LIVE             HISTORY
        │                  │
  Supabase Realtime    Vector Tiles
        │                  │
        ▼                  ▼
     deck.gl            MapLibre
```

Esto evita utilizar realtime para datos que no necesitan ser realtime.

---

## 31. Performance Requirements

Objetivos iniciales:

**Map**

- interacción fluida;
- zoom/pan sin bloqueos;
- renderizado GPU;
- clustering dinámico.

**Realtime**

Objetivo inicial:

```
< 1 segundo
```

entre:

```
INSERT en Supabase
        ↓
cliente muestra la observación (vía Realtime)
```

**Backend**

Debe poder soportar inicialmente:

```
100+ observations/sec
```

Supabase escala horizontalmente (connection pooling, réplicas de lectura) sin
requerir cambios de arquitectura para este volumen inicial.

---

## 32. Media Processing

El procesamiento pesado nunca debe bloquear la recepción.

```
Client → Cloudinary (upload directo, firmado)
   ↓
Cloudinary procesa (thumbnail, formato optimizado, eager transforms)
   ↓
Cloudinary → webhook de notificación
   ↓
Supabase Edge Function: cloudinary-webhook
   ↓
UPDATE observations/media (status: processed, derivedUrls)
   ↓
Supabase Edge Function: analyze-observation (async)
   ↓
Analysis (guardado en observation_analysis)
```

No:

```
Upload
 ↓
wait AI
 ↓
response
```

---

## 33. Event-driven architecture

En vez de un bus de eventos custom, se usan los mecanismos nativos de Supabase:

- **Database Webhooks**: disparan una Edge Function ante `INSERT`/`UPDATE` en
  `observations` o `incidents`.
- **pg_cron**: ejecuta jobs periódicos (recomputar cobertura, marcar `STALE`,
  intentar resolver incidentes).
- **Realtime**: notifica a los clientes suscritos.

Eventos equivalentes que el sistema debe poder emitir/observar:

```
ObservationCreated
ObservationUpdated
ObservationAnalyzed
IncidentCreated
IncidentUpdated
IncidentResolved
CoverageChanged
```

Esto permitirá posteriormente incorporar:

- AI;
- alertas;
- dashboards;
- operadores;
- APIs externas.

---

## 34. API

La mayoría de las operaciones de lectura/escritura se hacen **directamente desde el
cliente** contra Supabase (PostgREST + Realtime), protegidas por RLS. Solo la lógica
que debe ejecutarse en el servidor vive en Edge Functions.

### Crear observación (desde el cliente, vía SDK)

```typescript
// 1. Pedir firma de upload
const { data: signed } = await supabase.functions.invoke("cloudinary-sign");

// 2. Subir directo a Cloudinary con la firma
const media = await uploadToCloudinary(file, signed);

// 3. Insertar la observación en Supabase
await supabase.from("observations").insert({
  media,
  location: `POINT(${lng} ${lat})`,
  captured_at: capturedAt,
});
```

### Obtener observaciones (lectura directa)

```typescript
const { data } = await supabase
  .from("observations")
  .select("*")
  .gte("captured_at", from)
  .lte("captured_at", to);
```

Filtros equivalentes: `bbox` (vía función RPC con PostGIS), `from`/`to`, `status`,
`incident_id`.

### Obtener incidente

```typescript
const { data } = await supabase
  .from("incidents")
  .select("*, observations(*)")
  .eq("id", incidentId)
  .single();
```

### Realtime (suscripción)

```typescript
supabase
  .channel("observations")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "observations" },
    (payload) => handleNewObservation(payload.new)
  )
  .subscribe();
```

Evento recibido:

```json
{
  "type": "OBSERVATION_CREATED",
  "payload": {
    "id": "obs_8214",
    "location": {
      "lat": 4.813,
      "lng": -75.696
    },
    "capturedAt": "2026-08-13T05:31:42Z"
  }
}
```

### Edge Functions custom

```
POST /functions/v1/cloudinary-sign       → firma de upload
POST /functions/v1/cloudinary-webhook    → notificación de Cloudinary
POST /functions/v1/analyze-observation   → orquestar análisis IA
```

---

## 35. UX del ciudadano

Debe ser extremadamente simple.

**Pantalla**

```
┌─────────────────────┐
│                     │
│                     │
│       CAMERA        │
│                     │
│                     │
│                     │
│          ●          │
│                     │
│                     │
└─────────────────────┘
```

Un único botón:

```
CAPTURE
```

Después:

```
Uploading...
```

y:

```
✓ Observation sent
```

---

## 36. UX del operador

La interfaz operacional debe priorizar:

1. situación actual;
2. ubicación;
3. evidencia;
4. frescura;
5. evolución;
6. cobertura.

No saturar inicialmente con métricas innecesarias.

---

## 37. Seguridad y privacidad

El sistema debe considerar:

- **Auth**: sesiones anónimas de Supabase Auth por dispositivo para ciudadanos
  (permite asociar reportes sin pedir registro), magic-link/SSO para operadores.
- **RLS como control de acceso primario**: políticas explícitas por tabla y rol —
  un ciudadano anónimo puede `INSERT` observaciones pero no leer datos de otros
  usuarios; un operador autenticado tiene lectura ampliada.
- **Uploads firmados y acotados en Cloudinary**: upload preset de corta duración,
  restringido por tipo de archivo, tamaño máximo y carpeta destino — nunca un
  preset "unsigned" abierto en producción.
- **URLs firmadas de Cloudinary** para media sensible que no deba ser pública.
- consentimiento;
- minimización de datos;
- cifrado (en tránsito y en reposo, provisto por Supabase y Cloudinary);
- eliminación de metadata innecesaria (p. ej. EXIF con datos personales);
- protección de identidad del ciudadano;
- políticas de retención (tanto en Supabase como en Cloudinary).

La plataforma no debe almacenar información personal que no sea necesaria para el
funcionamiento.

---

## 38. Moderación y abuso

El sistema debe contemplar:

```
spam
fake reports
duplicated media
old media
malicious uploads
inappropriate content
```

Mecanismos:

- rate limiting (a nivel de Edge Function / políticas de RLS con límites por
  `sourceId`);
- hash de archivos / **detección de duplicados por hash perceptual** (capacidad
  nativa de Cloudinary, o add-ons de moderación/IA de Cloudinary);
- reputation score;
- revisión humana;
- confidence score.

---

## 39. Roadmap

### Fase 1 — Proof of Concept

Objetivo:

«Ver observaciones aparecer en tiempo real sobre Pereira.»

Implementar:

- React + Vite;
- MapLibre;
- deck.gl;
- proyecto Supabase (Postgres/PostGIS + Auth anónimo);
- upload directo a Cloudinary (signed upload preset vía Edge Function);
- location + timestamp;
- Supabase Realtime;
- observation markers.

### Fase 2 — MVP

Añadir:

- Supabase Auth para operadores;
- RLS refinado por rol;
- clustering;
- observation panel;
- historical data;
- coverage;
- filtros;
- timeline;
- vector tiles (ST_AsMVT + job programado).

### Fase 3 — Intelligence

Añadir:

- visión artificial (Edge Function `analyze-observation` + proveedor de IA);
- classification;
- confidence;
- incident detection (job pg_cron de clustering espacio-temporal);
- observation clustering;
- duplicate detection (aprovechando capacidades de Cloudinary).

### Fase 4 — Operational Intelligence

Añadir:

- incident graph;
- resource tracking;
- emergency routes;
- alerts;
- priority scoring;
- operator workflows.

---

## 40. MVP Definition

El MVP será considerado exitoso cuando:

1. Un ciudadano pueda abrir la aplicación.
2. Capture una fotografía/video.
3. El sistema obtenga location + time.
4. La evidencia se almacene en Cloudinary y la referencia en Supabase.
5. La observación aparezca en el mapa.
6. Otro usuario pueda verla prácticamente en tiempo real (vía Supabase Realtime).
7. El mapa soporte múltiples observaciones sin degradación significativa.
8. El usuario pueda seleccionar una observación.
9. Se pueda visualizar la evidencia (servida desde Cloudinary CDN).
10. Se pueda navegar históricamente por las observaciones.
11. Se pueda distinguir información LIVE, RECENT y STALE.
12. Se pueda visualizar cobertura de la ciudad.

---

## 41. Stack final recomendado

```
FRONTEND
────────────────────────────
React
TypeScript
Vite
Tailwind
Zustand
@supabase/supabase-js

MAP
────────────────────────────
MapLibre GL JS
deck.gl

PLATAFORMA (backend administrado)
────────────────────────────
Supabase
  ├── Postgres + PostGIS
  ├── PostgREST (REST autogenerado)
  ├── Auth
  ├── Realtime
  ├── Edge Functions (Deno)
  ├── Database Webhooks
  └── pg_cron

MEDIA
────────────────────────────
Cloudinary
  ├── Upload directo (signed)
  ├── CDN
  ├── Transformaciones / eager transforms
  └── Moderación / IA add-ons (opcional)

TILES
────────────────────────────
MVT (PostGIS ST_AsMVT)
PMTiles (históricos estáticos)

PROCESSING
────────────────────────────
Supabase Edge Functions
Servicios de IA (externos o add-ons de Cloudinary)

OBSERVABILITY
────────────────────────────
Logs/métricas nativos de Supabase
OpenTelemetry / Prometheus / Grafana (evolución posterior)
```

---

## 42. Arquitectura de referencia

```
                         ┌──────────────┐
                         │   CITIZEN    │
                         │              │
                         │ Camera       │
                         │ Location     │
                         │ Time         │
                         └──────┬───────┘
                                │
                     ┌──────────┴──────────┐
                     │                     │
                     ▼                     ▼
              ┌─────────────┐      ┌──────────────┐
              │ CLOUDINARY  │      │   SUPABASE   │
              │ (media      │      │              │
              │  upload     │      │ Postgres +   │
              │  directo)   │      │ PostGIS      │
              └──────┬──────┘      │              │
                     │             │ Auth / RLS   │
                     │  webhook    │              │
                     ▼             │ Realtime     │
              ┌─────────────┐      │              │
              │Edge Function│◄─────┤ Edge         │
              │cloudinary-  │      │ Functions    │
              │webhook      │      └──────┬───────┘
              └──────┬──────┘             │
                     │                    │
                     ▼                    │
              ┌─────────────┐             │
              │Edge Function│             │
              │analyze-     │             │
              │observation  │             │
              └──────┬──────┘             │
                     │                    │
                     ▼                    ▼
              ┌────────────┐      ┌──────────────┐
              │ Incidents  │      │  Realtime    │
              │ Coverage   │      │  Stream      │
              └──────┬─────┘      └──────┬───────┘
                     │                   │
                     └─────────┬─────────┘
                                ▼
                         ┌──────────────┐
                         │   FRONTEND   │
                         │              │
                         │   MapLibre   │
                         │      +       │
                         │   deck.gl    │
                         └──────────────┘
```

---

## 43. Decisión arquitectónica principal

La plataforma no debe construirse alrededor del mapa.

Debe construirse alrededor de:

```
OBSERVATION
```

El mapa es una representación.

La base de datos (Postgres/PostGIS en Supabase) es el estado espacial.

**Supabase Realtime** es el mecanismo de actualización.

**Cloudinary** es el almacenamiento y la transformación de la evidencia.

deck.gl es la representación masiva.

MapLibre es el mundo sobre el cual se representan los datos.

La arquitectura conceptual definitiva:

«Observation → Spatial State (Supabase) → Realtime Stream (Supabase Realtime) →
Situational Map»

Con la evidencia (foto/video) desacoplada en Cloudinary, referenciada — nunca
duplicada — desde el estado espacial.

---

## 44. Evolución futura

Una vez validado el MVP, el mismo sistema puede evolucionar desde:

```
EARTHQUAKE RESPONSE
```

hacia:

```
URBAN OBSERVATION NETWORK

├── Earthquakes
├── Floods
├── Landslides
├── Fires
├── Road incidents
├── Infrastructure
├── Public safety
├── Traffic
└── Environmental events
```

Por lo tanto, Pereira y el terremoto son el primer escenario de validación, no el
límite del producto.

---

## 45. Core Product Statement

«Una plataforma de inteligencia situacional que transforma evidencia capturada por
ciudadanos en un mapa vivo y georreferenciado del estado de una ciudad — con
Cloudinary como capa de evidencia y Supabase como capa de estado, realtime y
seguridad.»

**Input**

```
MEDIA (Cloudinary)
+
LOCATION (Supabase/PostGIS)
+
TIME
```

**Processing**

```
INGEST
→ STORE
→ ANALYZE
→ CORRELATE
→ UPDATE
```

**Output**

```
LIVE CITY STATE
```

**Experiencia final**

«La ciudad se observa a sí misma en tiempo real.»
