-- Verificación de solo lectura para el proyecto BrowserX.
-- Ejecutar en el SQL Editor de vhauzajfvlontxziqnaf antes de publicar la PWA.
-- No crea, modifica ni borra ningún objeto.

with checks(name, present) as (
  values
    ('schema pereiramap', exists (select 1 from pg_namespace where nspname = 'pereiramap')),
    ('table pereiramap.observation', to_regclass('pereiramap.observation') is not null),
    ('function public.pereiramap_enviar(jsonb)', to_regprocedure('public.pereiramap_enviar(jsonb)') is not null),
    ('view public.pereiramap_observacion_publica', to_regclass('public.pereiramap_observacion_publica') is not null),
    ('bucket field-photos', exists (select 1 from storage.buckets where id = 'field-photos')),
    ('column observed_feature_type', exists (
      select 1 from information_schema.columns
       where table_schema = 'pereiramap' and table_name = 'observation'
         and column_name = 'observed_feature_type'
    )),
    ('column damage_visible', exists (
      select 1 from information_schema.columns
       where table_schema = 'pereiramap' and table_name = 'observation'
         and column_name = 'damage_visible'
    )),
    ('column spatial_match_status', exists (
      select 1 from information_schema.columns
       where table_schema = 'pereiramap' and table_name = 'observation'
         and column_name = 'spatial_match_status'
    ))
)
select name, present,
       case when present then 'OK' else 'FALTA: aplicar la migración correspondiente' end as resultado
  from checks
 order by name;

-- Si existe el registro de Urban Recovery, esta consulta adicional permite
-- comprobar su historial sin modificarlo. Ejecutarla solo después de que la
-- primera consulta confirme que el esquema `rebuild_core` está disponible:
--
-- select filename, applied_at
--   from rebuild_core.schema_migration
--  order by filename;
