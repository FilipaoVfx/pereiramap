-- pereiramap 0002 — observación de campo y trazabilidad del spatial match.
-- Se aplica sobre 0001 sin reemplazar datos ni asumir que el GPS identifica
-- por sí solo el edificio fotografiado.

do $$ begin
  create type pereiramap.observed_feature_type as enum ('BUILDING', 'PARCEL', 'ROAD', 'PUBLIC_SPACE', 'UNKNOWN');
exception when duplicate_object then null; end $$;
do $$ begin
  create type pereiramap.damage_visibility as enum ('YES', 'NO', 'UNKNOWN');
exception when duplicate_object then null; end $$;
do $$ begin
  create type pereiramap.accessibility_status as enum ('OPEN', 'RESTRICTED', 'BLOCKED', 'UNKNOWN');
exception when duplicate_object then null; end $$;
do $$ begin
  create type pereiramap.spatial_match_status as enum ('UNMATCHED', 'CANDIDATE', 'CONFIRMED', 'REJECTED', 'AMBIGUOUS');
exception when duplicate_object then null; end $$;
do $$ begin
  create type pereiramap.match_method as enum ('GPS_CONTAINMENT', 'NEAREST_BUILDING', 'BEARING_MATCH', 'MANUAL_SELECTION', 'OPERATOR_CONFIRMED');
exception when duplicate_object then null; end $$;

alter table pereiramap.observation
  add column if not exists observed_feature_type pereiramap.observed_feature_type not null default 'UNKNOWN',
  add column if not exists damage_visible pereiramap.damage_visibility not null default 'UNKNOWN',
  add column if not exists accessibility pereiramap.accessibility_status not null default 'UNKNOWN',
  add column if not exists spatial_match_status pereiramap.spatial_match_status not null default 'UNMATCHED',
  add column if not exists spatial_match_score numeric(5,4) check (spatial_match_score is null or (spatial_match_score >= 0 and spatial_match_score <= 1)),
  add column if not exists matched_feature_id text,
  add column if not exists match_method pereiramap.match_method,
  add column if not exists operator_confirmed boolean not null default false,
  add column if not exists operator_confirmed_at timestamptz;

comment on table pereiramap.observation is
  'Field observation: evidencia localizada y fechada. Nunca salta directamente de foto a decisión; spatial_match y evidence fusion ocurren después.';

create index if not exists observation_match_status_idx
  on pereiramap.observation (spatial_match_status, received_at desc);

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
      observed_feature_type, damage_visible, accessibility,
      device_lon, device_lat, accuracy_m, device_fix_at, heading_deg,
      exif_lon, exif_lat, exif_captured_at, exif_heading_deg,
      manual_lon, manual_lat, geom, location_source,
      image_path, thumb_path, image_sha256, original_sha256, original_bytes, width, height
    ) values (
      oid, (p->>'device_id')::uuid, coalesce(p->>'app_version', ''),
      (p->>'captured_at')::timestamptz, nullif(p->>'category', '')::pereiramap.category,
      coalesce(nullif(p->>'observed_feature_type', ''), 'UNKNOWN')::pereiramap.observed_feature_type,
      coalesce(nullif(p->>'damage_visible', ''), 'UNKNOWN')::pereiramap.damage_visibility,
      coalesce(nullif(p->>'accessibility', ''), 'UNKNOWN')::pereiramap.accessibility_status,
      (p->>'device_lon')::double precision, (p->>'device_lat')::double precision,
      (p->>'accuracy_m')::numeric, (p->>'device_fix_at')::timestamptz, (p->>'heading_deg')::numeric,
      (p->>'exif_lon')::double precision, (p->>'exif_lat')::double precision,
      (p->>'exif_captured_at')::timestamptz, (p->>'exif_heading_deg')::numeric,
      (p->>'manual_lon')::double precision, (p->>'manual_lat')::double precision,
      st_setsrid(st_makepoint(0, 0), 4326)::geography, 'DEVICE',
      oid::text || '/full.jpg', oid::text || '/thumb.jpg', p->>'image_sha256',
      nullif(p->>'original_sha256', ''), (p->>'original_bytes')::integer,
      (p->>'width')::integer, (p->>'height')::integer
    ) returning * into r;
  end if;
  return jsonb_build_object(
    'observation_id', r.observation_id, 'received_at', r.received_at,
    'location_source', r.location_source, 'lon', st_x(r.geom::geometry),
    'lat', st_y(r.geom::geometry), 'exif_device_offset_m', r.exif_device_offset_m,
    'review_status', r.review_status, 'spatial_match_status', r.spatial_match_status
  );
end $$;

revoke all on function public.pereiramap_enviar(jsonb) from public;
grant execute on function public.pereiramap_enviar(jsonb) to anon, authenticated, service_role;

create or replace view public.pereiramap_observacion_publica as
  select o.observation_id, o.captured_at, o.received_at,
         o.category::text as category, st_x(o.geom::geometry) as lon,
         st_y(o.geom::geometry) as lat, o.location_source::text as location_source,
         o.accuracy_m, o.heading_deg, o.exif_lon is not null as exif_gps,
         o.exif_device_offset_m, o.image_path, o.thumb_path, o.image_sha256,
         o.width, o.height, o.review_status::text as review_status,
         o.observation_id as field_observation_id,
         o.observed_feature_type::text as observed_feature_type,
         o.damage_visible::text as damage_visible, o.accessibility::text as accessibility,
         o.spatial_match_status::text as spatial_match_status, o.spatial_match_score,
         o.matched_feature_id, o.match_method::text as match_method
    from pereiramap.observation o
   where o.review_status <> 'RECHAZADA';

grant select on public.pereiramap_observacion_publica to anon, authenticated, service_role;
