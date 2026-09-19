# pereiramap — foto de campo para Urban Recovery

El despliegue recomendado es Vercel. La configuración está en
[`vercel.json`](./vercel.json) y las variables necesarias están documentadas en
[`DEPLOYMENT.md`](./DEPLOYMENT.md).

La aplicación combina un dashboard operacional con captura de campo:
**te acercas al lugar afectado, tomas la foto, la envías.** Cada foto sale con
su ubicación y su hora, y pasa a ser evidencia visual de un sitio en
[Urban Recovery Intelligence](https://github.com/FilipaoVfx/rebuild) (URI):
los datos de recuperación de cada lugar quedan respaldados por lo que se ve
en el terreno.

```
abrir → [●] tomar foto → dónde / cuándo / qué se ve → Enviar → ✓
```

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| `src/` | Aplicación principal (React + TypeScript + Vite): dashboard, mapa y captura. |
| `app/` | Capturador legacy aislado, conservado para compatibilidad y pruebas offline. |
| `supabase/migrations/…_pereiramap_captura.sql` | Esquema `pereiramap` en el proyecto Supabase **compartido con URI**, bucket de fotos, función de envío y vista pública. |
| `docs/decisiones.md` | Por qué Supabase y no Cloudinary, cómo se resuelve la ubicación, qué se conserva del EXIF, cómo se enlaza con URI. |
| `PRD.md` | El PRD vigente: observaciones de campo, provenance, spatial matching y evidencia para el sistema de decisión. |
| `app/test/e2e_check.py` | Prueba del capturador legacy en Chromium con Supabase simulado. |

## Cómo funciona el envío

1. Al abrir, la app pide ubicación y la vigila (`watchPosition`, alta precisión) para que el fix ya exista cuando llegue la foto.
2. El botón abre la cámara (`<input capture="environment">`). Del archivo se leen **solo** tres cosas del EXIF: coordenadas GPS, hora de captura y rumbo. Después la imagen se re-codifica en un canvas (lado mayor 2048 px) y **pierde todos los metadatos**; se genera una miniatura de 480 px; se calcula el SHA-256 de lo que se sube y del original (que no se sube).
3. La pantalla de revisión muestra dónde (con ±m), cuándo, si la foto traía GPS y a qué distancia del teléfono. También registra, sin texto libre, la entidad observada (edificio, lote, vía o espacio público), daño visible y accesibilidad.
4. Enviar = dos `PUT` al Storage (`<uuid>/full.jpg`, `<uuid>/thumb.jpg`) y una llamada a `pereiramap_enviar(jsonb)`. Todo idempotente por `observation_id`: si la red se corta, el envío queda en IndexedDB y sale solo al volver la señal.
5. La base resuelve la ubicación con una regla escrita (manual > GPS del teléfono ≤ 100 m > EXIF > GPS impreciso), rechaza lo que cae fuera de la caja de Pereira, pone `received_at` con el reloj del servidor y deja la observación en `PENDIENTE`.
6. URI la recoge en su pipeline. La observación queda inicialmente `UNMATCHED`: el backend conserva `spatial_match_status`, método, score y confirmación del operador para asociarla después a edificio, lote, vía o zona. Publica solo las `APROBADA` (revisión humana: caras, placas, números de casa).

## Correr en local

```bash
npm ci
npm run dev                    # http://localhost:5173 (la cámara exige https o localhost)
npm run build
npm run preview
```

## Base de datos

La migración se aplica **una vez** sobre el proyecto Supabase de URI
(`vhauzajfvlontxziqnaf`), desde el editor SQL del panel o con
`supabase db push`. Crea:

- esquema `pereiramap` con la tabla `observation`, el trigger `resolver_ubicacion` y la función `revisar(id, estado, nota)`;
- en `public`, con prefijo: la función `pereiramap_enviar(jsonb)` (lo único que el cliente puede hacer) y la vista `pereiramap_observacion_publica` (lo único que se puede leer: sin `device_id`, sin coordenadas crudas, sin rechazadas);
- el bucket `field-photos` (público, JPEG, 6 MB) con política de solo subida para `anon`, nombres `<uuid>/(full|thumb).jpg`, sin sobrescritura ni borrado.

Revisar desde el editor SQL:

```sql
select observation_id, captured_at, category, review_status,
       'https://vhauzajfvlontxziqnaf.supabase.co/storage/v1/object/public/field-photos/' || image_path as foto
  from pereiramap.observation where review_status = 'PENDIENTE' order by received_at;

select pereiramap.revisar('<uuid>', 'APROBADA');
select pereiramap.revisar('<uuid>', 'RECHAZADA', 'se ve una placa');
```

## Publicar

Vercel construye la aplicación raíz mediante `vercel.json`. Define
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_CLOUDINARY_CLOUD_NAME` y `VITE_CLOUDINARY_UPLOAD_PRESET` en Preview y
Production. Consulta [DEPLOYMENT.md](./DEPLOYMENT.md).

## Lo que no hace (a propósito)

- No hay mapa ni pin manual todavía: el esquema ya admite `MANUAL`, la pantalla no. Sin GPS ni EXIF no se puede enviar, y la app lo dice.
- No hay video, ni análisis automático, ni incidentes, ni realtime: eso es el PRD largo. Aquí la unidad es una foto y su lugar.
- No hay cuentas. El freno de abuso es básico (60 envíos por dispositivo y hora, tamaño y tipo de archivo, caja geográfica). Si se abre al público general, va Turnstile o Supabase Auth anónimo delante.
