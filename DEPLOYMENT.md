# Despliegue

## Vercel

El repositorio se despliega desde la raíz. `vercel.json` instala las
dependencias de `app/`, construye la PWA de captura de campo y publica
`app/dist/`. El dashboard histórico de `src/` no es el artefacto de
producción: usa un modelo `pm_*` incompatible con el PRD vigente.

En Vercel:

1. Importa el repositorio `FilipaoVfx/pereiramap`.
2. Mantén **Root Directory** en `.`. El `vercel.json` raíz selecciona `app/`
   como artefacto de producción; no es necesario cambiar el directorio en el
   dashboard.
3. Define estas variables para Preview y Production. `VITE_SUPABASE_URL` debe
   apuntar al proyecto `browserx` (`vhauzajfvlontxziqnaf`), compartido con
   Urban Recovery:

   - `VITE_SUPABASE_URL=https://vhauzajfvlontxziqnaf.supabase.co`
   - `VITE_SUPABASE_KEY`

La clave de Supabase es publicable (una `sb_publishable_...` o la anon JWT),
nunca la `service_role`. El acceso real lo controlan Supabase, RLS y las
funciones expuestas.

4. Ejecuta el primer deploy. Los pushes a la rama conectada crearán previews y
   los pushes a Production desplegarán el dominio principal.

### Verificación local del mismo build

```bash
cd app
npm ci
npm run typecheck
npm run build
npm run preview
```

El deploy de Vercel no aplica migraciones. Antes del primer despliegue ejecuta,
en BrowserX y en orden, `20260918120000_pereiramap_captura.sql` y
`20260919000000_field_observation.sql`. Después ejecuta
`supabase/verify_browserx.sql`; es una comprobación de solo lectura que debe
devolver `OK` para todos los objetos de la PWA.

## Estructura

```text
app/                    # PWA de captura de campo: artefacto de producción
  src/                  # foto, geolocalización, cola offline y Supabase
src/                    # dashboard histórico, fuera del despliegue vigente
supabase/migrations/    # cambios versionados de base de datos
docs/                   # decisiones y documentación histórica
PRD.md                 # especificación vigente del producto
vercel.json             # contrato de build y routing de producción (app/)
```
