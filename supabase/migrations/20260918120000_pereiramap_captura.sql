-- pereiramap 0001 — captura de campo: una foto, una ubicación, una hora.
--
-- Vive en el MISMO proyecto Supabase que Urban Recovery Intelligence
-- (esquemas `rebuild_*`) y que otro producto (`public`). Por eso todo lo de
-- esta app va en el esquema `pereiramap`, y en `public` solo quedan los dos
-- puntos de entrada que PostgREST necesita exponer, con prefijo
-- `pereiramap_` para que nadie los confunda con tablas de los otros dos.
--
-- Principios (docs/decisiones.md):
--   1. Cero cuentas: el cliente se identifica con un `device_id` aleatorio
--      por instalación. No es una persona; no se publica.
--   2. La imagen que se sube ya viene SIN metadatos (el cliente la
--      re-codifica). Lo que se conserva del EXIF se extrae antes y viaja
--      como columnas: coordenadas, hora, rumbo. Nada más.
--   3. La ubicación se resuelve en la base, con una regla escrita, y se
--      guarda de dónde salió (`location_source`).
--   4. Sin texto libre: una categoría cerrada evita que alguien escriba un
--      nombre o una dirección en una foto de un edificio.
--   5. Nada se publica sin revisión, pero la revisión no borra: `RECHAZADA`
--      desaparece de la vista pública y queda en la tabla.

create schema if not exists pereiramap;

create type pereiramap.location_source as enum ('DEVICE', 'EXIF', 'MANUAL');
create type pereiramap.review_status as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');
create type pereiramap.category as enum (
  'COLAPSO',               -- edificio o parte de él en el suelo
  'DANO_ESTRUCTURAL',      -- grietas en columnas/muros portantes, inclinación
  'DANO_LEVE',             -- fachada, vidrios, acabados
  'ESCOMBROS',             -- escombros en vía o espacio público
  'VIA_AFECTADA',          -- vía, puente o andén afectado
  'EQUIPAMIENTO_AFECTADO', -- colegio, hospital, iglesia, parque afectado
  'SIN_DANO_VISIBLE',      -- se fotografió y no se ve daño
  'OTRO'
);

create table pereiramap.observation (
  observation_id       uuid primary key,          -- lo genera el cliente: el reintento es idempotente
  device_id            uuid not null,
  app_version          text not null default '',
  captured_at          timestamptz not null,      -- reloj del dispositivo al disparar
  received_at          timestamptz not null default now(),  -- reloj del servidor; lo pone el trigger
  category             pereiramap.category,

  -- Ubicación cruda, tal como llegó. Se guarda todo para poder auditar la
  -- regla de resolución después.
  device_lon           double precision,
  device_lat           double precision,
  accuracy_m           numeric(7,1) check (accuracy_m is null or accuracy_m >= 0),
  device_fix_at        timestamptz,               -- cuándo se obtuvo ese fix; la foto puede ser anterior
  heading_deg          numeric(5,1) check (heading_deg is null or (heading_deg >= 0 and heading_deg < 360)),
  exif_lon             double precision,
  exif_lat             double precision,
  exif_captured_at     timestamptz,
  exif_heading_deg     numeric(5,1) check (exif_heading_deg is null or (exif_heading_deg >= 0 and exif_heading_deg < 360)),
  manual_lon           double precision,
  manual_lat           double precision,

  -- Ubicación resuelta por `pereiramap.resolver_ubicacion()`.
  geom                 geography(Point, 4326) not null,
  location_source      pereiramap.location_source not null,
  exif_device_offset_m numeric(8,1),              -- distancia EXIF ↔ dispositivo, si hay ambas

  -- Imagen ya sin metadatos, en el bucket `field-photos`.
  image_path           text not null,
  thumb_path           text not null,
  image_sha256         text not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  original_sha256      text check (original_sha256 is null or original_sha256 ~ '^[0-9a-f]{64}$'),
  original_bytes       integer check (original_bytes is null or original_bytes > 0),
  width                integer not null check (width between 64 and 8192),
  height               integer not null check (height between 64 and 8192),

  -- Revisión humana antes de publicar (caras, placas, números de casa).
  review_status        pereiramap.review_status not null default 'PENDIENTE',
  reviewed_at          timestamptz,
  review_note          text,

  constraint image_path_shape check (image_path = observation_id::text || '/full.jpg'),
  constraint thumb_path_shape check (thumb_path = observation_id::text || '/thumb.jpg')
);

create index observation_geom_gix on pereiramap.observation using gist (geom);
create index observation_captured_idx on pereiramap.observation (captured_at desc);
create index observation_device_recent_idx on pereiramap.observation (device_id, received_at desc);

comment on table pereiramap.observation is
  'Una foto de campo con su ubicación y hora. Sin datos personales por diseño: '
  'device_id es una instalación, no una persona; la imagen se sube sin EXIF.';

-- Caja generosa alrededor del municipio de Pereira. No es el límite
-- municipal: sirve para rechazar (0,0), coordenadas invertidas y pruebas
-- desde otra ciudad, no para decidir qué es Pereira.
create or replace function pereiramap.dentro_de_pereira(lon double precision, lat double precision)
returns boolean language sql immutable as $$
  select lon between -76.10 and -75.35 and lat between 4.55 and 5.05
$$;

-- Regla de resolución de la ubicación, en este orden:
--   MANUAL  el usuario movió el pin porque el GPS no servía;
--   DEVICE  el GPS del dispositivo al disparar, si su precisión es ≤ 100 m;
--   EXIF    las coordenadas dentro de la foto, si las traía;
--   DEVICE  el GPS aunque sea impreciso, antes que nada.
-- La precisión se guarda siempre: el que lee decide cuánto se fía.
create or replace function pereiramap.resolver_ubicacion()
returns trigger language plpgsql security definer set search_path = pereiramap, public as $$
declare
  lon double precision;
  lat double precision;
  src pereiramap.location_source;
  recientes integer;
begin
  new.received_at := now();
  new.review_status := 'PENDIENTE';
  new.reviewed_at := null;
  new.review_note := null;

  if new.manual_lon is not null and new.manual_lat is not null then
    lon := new.manual_lon; lat := new.manual_lat; src := 'MANUAL';
  elsif new.device_lon is not null and new.device_lat is not null
        and (new.accuracy_m is null or new.accuracy_m <= 100) then
    lon := new.device_lon; lat := new.device_lat; src := 'DEVICE';
  elsif new.exif_lon is not null and new.exif_lat is not null then
    lon := new.exif_lon; lat := new.exif_lat; src := 'EXIF';
  elsif new.device_lon is not null and new.device_lat is not null then
    lon := new.device_lon; lat := new.device_lat; src := 'DEVICE';
  else
    raise exception 'SIN_UBICACION: la observación no trae ninguna coordenada'
      using errcode = 'check_violation';
  end if;

  if not pereiramap.dentro_de_pereira(lon, lat) then
    raise exception 'FUERA_DE_PEREIRA: (%, %) queda fuera de la caja del municipio', lon, lat
      using errcode = 'check_violation';
  end if;

  new.geom := st_setsrid(st_makepoint(lon, lat), 4326)::geography;
  new.location_source := src;

  if new.device_lon is not null and new.exif_lon is not null then
    new.exif_device_offset_m := round(st_distance(
      st_setsrid(st_makepoint(new.device_lon, new.device_lat), 4326)::geography,
      st_setsrid(st_makepoint(new.exif_lon, new.exif_lat), 4326)::geography)::numeric, 1);
  end if;

  -- Freno básico contra un cliente en bucle o un script: 60 envíos por
  -- dispositivo y hora. No es anti-abuso serio; eso va con Auth o Turnstile.
  select count(*) into recientes from pereiramap.observation
   where device_id = new.device_id and received_at > now() - interval '1 hour';
  if recientes >= 60 then
    raise exception 'LIMITE_POR_DISPOSITIVO: más de 60 envíos en una hora'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger observation_resolver_ubicacion
  before insert on pereiramap.observation
  for each row execute function pereiramap.resolver_ubicacion();

-- Nadie edita ni borra por la API: la evidencia es inmutable. La revisión
-- pasa por `pereiramap.revisar`, que corre desde el editor SQL del proyecto.
alter table pereiramap.observation enable row level security;

create or replace function pereiramap.revisar(p_observation_id uuid, p_estado text, p_nota text default null)
returns pereiramap.observation language sql as $$
  update pereiramap.observation
     set review_status = p_estado::pereiramap.review_status,
         reviewed_at = now(),
         review_note = p_nota
   where observation_id = p_observation_id
  returning *;
$$;

-- ── Puntos de entrada expuestos por PostgREST (en `public`, con prefijo) ──

-- Envío. Una sola función, con los parámetros a la vista, en vez de INSERT
-- directo con grants sobre la tabla: la validación vive en un lugar y el
-- rol `anon` no toca la tabla. Idempotente por `observation_id`: reintentar
-- el mismo envío devuelve el mismo registro.
create or replace function public.pereiramap_enviar(p jsonb)
returns jsonb language plpgsql security definer set search_path = pereiramap, public as $$
declare
  oid uuid := (p->>'observation_id')::uuid;
  r pereiramap.observation;
begin
  select * into r from pereiramap.observation where observation_id = oid;
  if not found then
    insert into pereiramap.observation (
      observation_id, device_id, app_version, captured_at, category,
      device_lon, device_lat, accuracy_m, device_fix_at, heading_deg,
      exif_lon, exif_lat, exif_captured_at, exif_heading_deg,
      manual_lon, manual_lat,
      geom, location_source,
      image_path, thumb_path, image_sha256, original_sha256, original_bytes, width, height
    ) values (
      oid,
      (p->>'device_id')::uuid,
      coalesce(p->>'app_version', ''),
      (p->>'captured_at')::timestamptz,
      nullif(p->>'category', '')::pereiramap.category,
      (p->>'device_lon')::double precision, (p->>'device_lat')::double precision,
      (p->>'accuracy_m')::numeric, (p->>'device_fix_at')::timestamptz, (p->>'heading_deg')::numeric,
      (p->>'exif_lon')::double precision, (p->>'exif_lat')::double precision,
      (p->>'exif_captured_at')::timestamptz, (p->>'exif_heading_deg')::numeric,
      (p->>'manual_lon')::double precision, (p->>'manual_lat')::double precision,
      -- el trigger los sobrescribe; van para satisfacer NOT NULL antes del BEFORE
      st_setsrid(st_makepoint(0, 0), 4326)::geography, 'DEVICE',
      oid::text || '/full.jpg', oid::text || '/thumb.jpg',
      p->>'image_sha256', nullif(p->>'original_sha256', ''),
      (p->>'original_bytes')::integer, (p->>'width')::integer, (p->>'height')::integer
    ) returning * into r;
  end if;
  return jsonb_build_object(
    'observation_id', r.observation_id,
    'received_at', r.received_at,
    'location_source', r.location_source,
    'lon', st_x(r.geom::geometry), 'lat', st_y(r.geom::geometry),
    'exif_device_offset_m', r.exif_device_offset_m,
    'review_status', r.review_status
  );
end $$;

revoke all on function public.pereiramap_enviar(jsonb) from public;
grant execute on function public.pereiramap_enviar(jsonb) to anon, authenticated, service_role;

-- Lectura pública: lo que Urban Recovery (y cualquiera) puede ver. Sin
-- `device_id`, sin las coordenadas crudas, sin RECHAZADAS. `review_status`
-- viaja para que quien publica decida si muestra las pendientes.
create or replace view public.pereiramap_observacion_publica as
  select o.observation_id,
         o.captured_at,
         o.received_at,
         o.category::text        as category,
         st_x(o.geom::geometry)  as lon,
         st_y(o.geom::geometry)  as lat,
         o.location_source::text as location_source,
         o.accuracy_m,
         o.heading_deg,
         (o.exif_lon is not null) as exif_gps,
         o.exif_device_offset_m,
         o.image_path,
         o.thumb_path,
         o.image_sha256,
         o.width,
         o.height,
         o.review_status::text   as review_status
    from pereiramap.observation o
   where o.review_status <> 'RECHAZADA';

grant select on public.pereiramap_observacion_publica to anon, authenticated, service_role;

-- ── Almacenamiento ────────────────────────────────────────────────────────
-- Bucket público de solo escritura para `anon`: subir sí, con nombre
-- `<uuid>/full.jpg` o `<uuid>/thumb.jpg`, JPEG y hasta 6 MB; sobrescribir o
-- borrar, no. Público porque la foto publicada ES el producto y porque el
-- pipeline de Urban Recovery la copia a su propio servidor desde aquí.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('field-photos', 'field-photos', true, 6291456, array['image/jpeg'])
on conflict (id) do nothing;

create policy "pereiramap: subir foto"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'field-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(full|thumb)\.jpg$'
  );

create policy "pereiramap: leer foto"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'field-photos');
