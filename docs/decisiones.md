# Decisiones — pereiramap v0.2 (2026-09-19)

Recorte del PRD v0.2 al flujo principal, a pedido del dueño: *el usuario se
acerca al punto de destrucción, toma la foto y se sube al sistema; las
imágenes se enlazan por coordenadas y metadatos con la misma ubicación y
datos dentro de Urban Recovery.*

## 1. Supabase para todo; Cloudinary, no

**Pregunta del dueño:** ¿se puede usar la misma base de Supabase, o mejor Cloudinary?

**Respuesta: la misma base de Supabase, para datos y para imágenes.** El proyecto
`vhauzajfvlontxziqnaf` («browserx») es el plano de datos de producción de URI
(esquemas `rebuild_*`, migraciones 001–008 aplicadas el 2026-09-16, PostGIS
3.3, pgRouting 3.4) y ya aloja otro producto en `public`. pereiramap entra
como un tercer esquema, `pereiramap`, con dos puntos de entrada prefijados en
`public`.

Por qué no Cloudinary, aunque el PRD lo prescribía:

| Criterio | Cloudinary | Supabase Storage |
|---|---|---|
| Lo que aportaría | Extraer EXIF en el servidor, transformaciones, moderación | — |
| EXIF | Llega **sin GPS** en la mayoría de capturas desde la web (iOS Safari no lo escribe; el selector de fotos permite quitarlo). Extraerlo en el servidor no arregla lo que el navegador no envía. Se lee en el cliente, que además es el que tiene el GPS del teléfono. | Igual: el cliente ya extrajo lo que hay. |
| Miniaturas | Transformaciones bajo demanda | Se generan en el cliente (480 px), que ya está re-codificando la imagen. |
| Vendors / credenciales / webhooks | +1 cuenta, firma de subida (Edge Function), webhook de vuelta a Supabase | 0 nuevos: la misma URL y clave publicable |
| Regla de URI (`fuentes.md` §11: el visor publicado no consulta terceros) | Habría que copiar las imágenes a la infraestructura de URI igualmente | Supabase ya es el almacén previsto por URI (ADR-10). El pipeline las copia a `data/field/` de todos modos. |
| Costo | Plan gratuito suficiente | Plan gratuito suficiente (1 GB) |

Cloudinary tendría sentido si hiciera falta análisis de imagen o video en el
servidor. No es este recorte.

## 2. La ubicación: teléfono primero, EXIF de cotejo

El GPS del EXIF **no es fiable como fuente primaria** en una app web: la cámara
abierta desde Safari no lo escribe; Android depende de la app de cámara; al
elegir de la galería el usuario puede quitarlo. La app vigila la posición desde
que abre (`enableHighAccuracy`), guarda el fix que había al disparar con su
precisión y su hora (`device_fix_at`), y lee el EXIF como segunda fuente y como
cotejo (`exif_device_offset_m`).

La regla vive en la base (`pereiramap.resolver_ubicacion`), no en el cliente, y
queda registrada en `location_source`:

1. `MANUAL` — pin movido por el usuario (previsto en el esquema, sin pantalla todavía);
2. `DEVICE` — GPS del teléfono si su precisión es ≤ 100 m;
3. `EXIF` — coordenadas de la foto;
4. `DEVICE` — GPS del teléfono aunque sea impreciso.

Sin ninguna → la base rechaza (`SIN_UBICACION`). Fuera de la caja
[−76,10, −75,35] × [4,55, 5,05] → rechaza (`FUERA_DE_PEREIRA`). Las coordenadas
crudas de ambas fuentes se guardan para poder auditar la regla después.

## 3. Del EXIF se conservan tres datos; la imagen sube sin ninguno

Se extraen coordenadas, `DateTimeOriginal` y `GPSImgDirection`. La imagen se
re-codifica en un canvas: pierde marca, modelo, serie, software, miniatura
incrustada y cualquier otro bloque. Es la misma imagen que se publica. Se
guarda el SHA-256 de lo subido y el del original (que se queda en el teléfono)
para poder demostrar después que una foto publicada es la que se envió.

## 4. Sin cuentas, sin texto libre

`device_id` es un UUID aleatorio por instalación, guardado en `localStorage`;
sirve para el freno de 60 envíos/hora y para que el usuario reconozca sus
envíos. No sale en la vista pública. No hay campo de texto: una categoría
cerrada de ocho valores evita que alguien escriba un nombre, un teléfono o una
dirección en la ficha de un edificio (regla FR-PII-01 de URI).

## 5. Revisión antes de publicar, sin borrar

Toda observación nace `PENDIENTE`. `pereiramap.revisar()` la pasa a `APROBADA`
o `RECHAZADA`. La vista pública excluye las rechazadas y conserva la columna
`review_status` para que quien publica decida: URI muestra pendientes con
etiqueta en el visor interno y solo aprobadas en el paquete público. Los
objetos del bucket son públicos desde la subida (el pipeline de URI los copia
desde ahí); rechazar una foto oculta la fila, y el objeto se borra desde el
panel de Storage.

## 6. El enlace con Urban Recovery vive en Urban Recovery

pereiramap no sabe qué es un «sitio». URI registra `pereiramap` como fuente
(ATTRIBUTION, CC BY 4.0 por el texto de consentimiento que el usuario acepta
al enviar), lee `pereiramap_observacion_publica` en su pipeline, copia las
imágenes a `data/field/`, enlaza cada foto al `rebuild_core.site` más cercano
a ≤ 75 m (un minuto a pie, la misma constante que sus captaciones) y la sirve
desde su propio origen. Ver ADR-24 en el repo `rebuild`.

## 7. Lo que se dejó fuera del PRD, y por qué

Video, análisis automático de la imagen, incidentes, agrupación, realtime,
capas temporales, grafo, cobertura: todo eso presupone que el flujo básico ya
produce observaciones fiables. Primero eso. El PRD queda como visión; este
documento, como lo construido.
