# Despliegue

## Vercel

El repositorio está preparado para desplegarse desde la raíz. `vercel.json`
instala las dependencias del proyecto Vite principal, ejecuta su build y publica
`dist/`.

En Vercel:

1. Importa el repositorio `FilipaoVfx/pereiramap`.
2. Mantén **Root Directory** en `.`. No selecciones `app/`: el `vercel.json`
   raíz ya configura el proyecto.
3. Define estas variables para Preview y Production:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_CLOUDINARY_CLOUD_NAME`
   - `VITE_CLOUDINARY_UPLOAD_PRESET`

   Las variables de Supabase y Cloudinary son publicables. El acceso real lo controlan Supabase,
   RLS y las funciones expuestas, nunca un secreto enviado al navegador.

4. Ejecuta el primer deploy. Los pushes a la rama conectada crearán previews y
   los pushes a Production desplegarán el dominio principal.

### Verificación local del mismo build

```bash
npm ci
npm run typecheck
npm run build
npm run preview
```

El deploy de Vercel no aplica migraciones. Las migraciones de
`supabase/migrations/` se ejecutan en el proyecto Supabase antes de publicar una
versión que use sus nuevas columnas o funciones.

## Estructura

```text
src/                    # aplicación principal React/Vite
  components/           # piezas visuales reutilizables
  pages/                # Dashboard y captura
  hooks/                # realtime y estado derivado
  lib/                  # Supabase, Cloudinary y dominio
  store/                # estado global del mapa
app/                    # captura legacy aislada y sus pruebas
supabase/migrations/    # cambios versionados de base de datos
docs/                   # decisiones y documentación histórica
PRD.md                 # especificación vigente del producto
vercel.json             # contrato de build y routing de producción
```
