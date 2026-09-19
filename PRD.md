Sí. Y aquí haría una separación muy estricta entre la PWA de campo y el sistema de decisión. La PWA no debería simplemente “subir una foto con coordenadas”; debería producir una observación geoespacial verificable que luego pueda modificar o validar la evidencia que usa el sistema principal.

La clave es esta:

> La foto no se relaciona directamente con una oportunidad urbana. Se relaciona primero con una observación física localizada; esa observación se relaciona con una entidad espacial conocida; y solo después alimenta el sistema de decisión.



Esto es importante porque una coordenada GPS de un teléfono tiene error, y una edificación puede ocupar un polígono bastante mayor que el punto donde estaba parado el operador. OGC también enfatiza que la precisión y procedencia de las coordenadas deben formar parte del tratamiento de los datos espaciales. 

1. Yo diseñaría el flujo así

PWA CAMPO
                     │
                     ▼
              ┌─────────────┐
              │ OBSERVACIÓN │
              └──────┬──────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
     FOTO        POSICIÓN       TIEMPO
        │            │            │
        └────────────┼────────────┘
                     ▼
             VALIDACIÓN ESPACIAL
                     │
                     ▼
             ENTIDAD OBSERVADA
          edificio / lote / vía
                     │
                     ▼
             EVIDENCIA DE DAÑO
                     │
                     ▼
          ┌──────────────────────┐
          │ SISTEMA DECISIÓN     │
          │                      │
          │ riesgo               │
          │ necesidad            │
          │ POT                  │
          │ accesibilidad        │
          │ población            │
          │ déficit              │
          │ oportunidad          │
          └──────────┬───────────┘
                     ▼
             ACTUALIZACIÓN DE
          RECOVERY OPPORTUNITY

La diferencia parece pequeña, pero arquitectónicamente es enorme.


---

2. La entidad central de la PWA debería ser field_observation

No:

photo

ni:

damaged_building

sino:

field_observation

Por ejemplo:

{
  "observation_id": "OBS-000184",
  "captured_at": "2026-09-19T04:42:31Z",

  "location": {
    "lat": 4.812341,
    "lon": -75.694821,
    "accuracy_m": 4.8,
    "altitude_m": 1411.2
  },

  "device": {
    "platform": "android",
    "location_source": "gps"
  },

  "media": [
    {
      "asset_id": "IMG-000184-01",
      "type": "photo",
      "sha256": "..."
    }
  ],

  "observation": {
    "object_type": "building",
    "damage_visible": true,
    "accessibility": "restricted"
  }
}

Pero no pondría todavía:

"building_id": 1837

como si fuera una verdad.

Eso debe ser el resultado de una etapa posterior.


---

3. Necesitas un concepto fundamental: spatial_match

Aquí está probablemente la parte más importante de todo tu sistema.

Cuando el usuario toma la foto:

GPS del teléfono
      │
      ▼
POINT
      │
      ▼
¿Dónde cae este punto?
      │
      ├── building polygon
      ├── parcel polygon
      ├── road
      ├── public space
      └── unknown

Pero además necesitas considerar:

GPS accuracy = 5 m

Entonces no puedes hacer:

ST_Within(photo_point, building.geometry)

y asumir que eso determina correctamente el edificio.

Porque puede ocurrir:

EDIFICIO A
       ┌──────────────┐
       │              │
       │              │
       └──────────────┘
              ↑
           fachada

              ● GPS
             / \
            /   \
        error ±5m

El punto podría caer en la acera aunque la persona esté fotografiando correctamente el edificio.


---

4. Por eso la PWA debe registrar dos cosas

A. Posición del observador

observer_location

B. Objeto observado

observed_feature

No son necesariamente iguales.

Ejemplo:

OBSERVADOR

        ●
        │
        │ 8.2 m
        ▼

┌────────────────────────┐
│                        │
│     EDIFICIO           │
│                        │
└────────────────────────┘

El usuario puede estar parado en la calle.

La foto apunta al edificio.

Por eso una relación basada exclusivamente en GPS sería insuficiente.


---

5. La PWA debería hacer una primera asociación automática

Después de capturar:

GPS
+
accuracy
+
heading
+
timestamp
+
photo

el backend busca candidatos.

Por ejemplo:

OBS-184
                    │
                    ▼
             POINT + 4.8m
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     Building A           Building B
       7.2m                 18m
          │
          ▼
    candidate = A

Pero candidate ≠ confirmed.

Yo utilizaría estados:

UNMATCHED
CANDIDATE
CONFIRMED
REJECTED
AMBIGUOUS


---

6. Incluso puedes calcular un spatial_match_score

Por ejemplo:

Spatial Match
─────────────

GPS proximity          0.92
Building containment   0.80
Photo direction        0.95
Address consistency    1.00
Operator confirmation  1.00

                     ─────
                     0.93

Pero cuidado:

no conviertas esto automáticamente en una "probabilidad".

Es mejor:

match_score = 0.93
match_status = "high_confidence"

porque no tienes necesariamente un dataset estadístico que permita interpretar 0.93 como 93% de probabilidad.


---

7. Hay un dato que yo agregaría: dirección de cámara

Esto puede mejorar muchísimo la relación.

Si el teléfono puede obtener:

latitude
longitude
heading

puedes saber aproximadamente:

persona
  ●
  │
  │ heading = 72°
  └──────────────►
                  edificio

Entonces puedes buscar:

buildings within 30m
AND
building lies within camera bearing ± θ

Eso es mucho mejor que simplemente:

nearest building

Porque el edificio más cercano no necesariamente es el que se está fotografiando.


---

8. Y aquí aparece otra dimensión: evidencia fotográfica

La foto debe tener su propia entidad:

evidence_asset

evidence_asset
├── asset_id
├── observation_id
├── captured_at
├── sha256
├── storage_uri
├── mime_type
├── width
├── height
├── original_filename
└── exif_metadata

Y la observación:

field_observation
├── observation_id
├── location
├── accuracy
├── heading
├── captured_at
├── observer
└── observed_feature

Así puedes demostrar posteriormente:

> Esta evidencia fue capturada en esta posición, en este momento, por este dispositivo, y fue asociada posteriormente a esta entidad espacial.



Eso es provenance.


---

9. No sobrescribas los datos del sistema

Esto también es crítico.

Supongamos que el sistema principal tiene:

Building 1837

damage:
HIGH

source:
Copernicus

confidence:
0.71

Llega la PWA:

OBS-184

field observation:
visible severe structural damage

No hagas:

Building 1837
damage = HIGH

Sobrescribiendo la fuente anterior.

Haz:

Building 1837
       │
       ├── Satellite evidence
       │
       ├── Municipal inspection
       │
       ├── Field observation OBS-184
       │
       └── Citizen report

Y después:

damage_assessment

fusiona las evidencias.


---

10. Esto te permite construir algo mucho más serio

BUILDING 1837
│
├── DAMAGE EVIDENCE
│
│   ├── Satellite
│   │   date: Aug 12
│   │   class: severe
│   │
│   ├── Field
│   │   date: Sep 19
│   │   visible: yes
│   │   photos: 3
│   │
│   └── Municipal
│       inspection: pending
│
├── POT
│
├── RISK
│
├── POPULATION
│
├── ACCESSIBILITY
│
├── PUBLIC SPACE DEFICIT
│
└── URBAN OPPORTUNITIES

Y entonces el sistema puede decir:

> La evidencia de campo incrementó la confianza de que existe daño observable en este inmueble.



Pero no:

> "La IA determinó que el edificio debe demolerse."




---

11. La precisión espacial debe tener niveles

Yo establecería algo como:

Nivel 0 — sin ubicación confiable

accuracy > 50m

No relacionar automáticamente con un edificio.

Nivel 1 — ubicación aproximada

20–50m

Relacionar solamente con:

sector
manzana
zona

Nivel 2 — ubicación utilizable

5–20m

Generar candidatos.

Nivel 3 — ubicación precisa

<5m

Permitir asociación automática condicionada a otras evidencias.

Nivel 4 — confirmación de operador

GPS
+
visual
+
operator confirmation

CONFIRMED

Pero no pondría valores universales como requisitos rígidos sin probarlos en campo. El error real depende del dispositivo, cielo abierto, entorno urbano, multipath, etc.


---

12. El usuario debería confirmar visualmente

Esta parte es fundamental.

Después de tomar la foto:

┌───────────────────────────────┐
│                               │
│         FOTO                  │
│                               │
└───────────────────────────────┘

Detectamos:

┌───────────────────────────────┐
│ 📍 Posible edificio           │
│                               │
│ Carrera XX # XX-XX            │
│ ID: BLD-1837                  │
│ Distancia: 7.4 m              │
│ Match espacial: ALTO          │
│                               │
│       [ CONFIRMAR ]           │
│       [ ELEGIR OTRO ]         │
└───────────────────────────────┘

Eso es muchísimo más robusto que intentar automatizar el 100%.


---

13. Y la PWA puede aprovechar la visual del sistema principal

Aquí creo que tienes una oportunidad brutal.

El trabajador no debería llegar a un formulario vacío.

Al entrar al lugar:

📍

       ┌───────────────┐
       │   SITIO #1837 │
       │               │
       │ DAMAGE  HIGH  │
       │ RISK    HIGH  │
       │ POT     MIXED │
       └───────────────┘

Y debajo:

¿Por qué estamos observando este lugar?

DAÑO
█████████░

NECESIDAD
████████░░

RIESGO
███████░░░

OPORTUNIDAD
█████████░

Entonces el operador sabe qué debe verificar.


---

14. La misión puede ser específica

En lugar de:

> "Inspeccione edificio."



El sistema puede generar:

MISIÓN DE CAMPO

OPPORTUNITY #017

HIPÓTESIS DEL SISTEMA

Transformar este lote podría:
+ aumentar espacio público
+ mejorar accesibilidad
+ atender 6.200 personas
+ reducir déficit del sector

PERO:

⚠️ evidencia de daño incompleta
⚠️ uso actual desconocido
⚠️ condición del inmueble no confirmada

VERIFICAR:

□ Estado físico
□ Uso actual
□ Accesibilidad
□ Ocupación
□ Condición del entorno
□ Fotografías fachada
□ Fotografías laterales

Esto transforma la PWA de:

"app para tomar fotos"

a:

instrumento de adquisición de evidencia para un sistema de decisión.


---

15. El flujo completo que construiría

SISTEMA PRINCIPAL
                         │
                         ▼
                RECOVERY OPPORTUNITY
                         │
                         ▼
                  FIELD MISSION
                         │
                         ▼
              ┌─────────────────────┐
              │       PWA           │
              │                     │
              │ GPS                 │
              │ timestamp           │
              │ heading             │
              │ photo               │
              │ observations        │
              │ operator validation │
              └──────────┬──────────┘
                         │
                         ▼
                  SPATIAL MATCH
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          BUILDING     PARCEL      ZONE
              │
              ▼
          EVIDENCE
              │
              ▼
       EVIDENCE FUSION
              │
              ▼
       UPDATED FEATURES
              │
              ▼
      UPDATED OPPORTUNITY
              │
              ▼
          DECISION


---

16. Hay otra cosa que haría desde el día 1: auditoría

Cada cambio debería quedar registrado:

observation_id
created_at
created_by
location
location_accuracy
source
original_data
matched_entity
match_method
match_score
operator_confirmation
evidence_assets
processing_version

Y particularmente:

match_method

podría ser:

GPS_CONTAINMENT
NEAREST_BUILDING
BEARING_MATCH
MANUAL_SELECTION
OPERATOR_CONFIRMED

Esto te permitirá responder posteriormente:

> ¿Por qué esta fotografía terminó asociada a este edificio?



Y esa pregunta va a ser extremadamente importante si el sistema termina utilizándose para decisiones reales.


---

17. Y una última decisión técnica importante

Para la PWA usaría:

PWA
├── Camera API
├── Geolocation API
├── DeviceOrientation
├── IndexedDB
├── Service Worker
└── Background Sync

La captura debería funcionar offline.

Porque el escenario real es:

llega al sitio
↓
sin señal
↓
toma fotografía
↓
GPS funciona
↓
observación queda en IndexedDB
↓
continúa trabajando
↓
recupera conexión
↓
sync

Y en backend:

PWA
 ↓
API
 ↓
PostgreSQL + PostGIS
 ↓
spatial matching
 ↓
evidence store
 ↓
decision engine

Para intercambio geoespacial puedes mantener GeoJSON/CRS84 como representación interoperable; el estándar JSON-FG publicado por OGC en 2026 amplía precisamente las capacidades de GeoJSON para CRS, tiempo y tipos de features. 

En resumen

Tu arquitectura debería tener tres niveles de verdad:

┌─────────────────────────────────────────┐
│ 1. OBSERVACIÓN                          │
│ "Esto fue observado aquí y ahora."      │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. EVIDENCIA                            │
│ "Esta observación está relacionada con  │
│  esta entidad espacial."                │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. DECISIÓN                             │
│ "Esta evidencia modifica nuestra        │
│ comprensión de la oportunidad urbana."  │
└─────────────────────────────────────────┘

Nunca saltaría directamente de foto → decisión.

Ese puente intermedio —observación → matching espacial → evidencia → feature → oportunidad— es lo que puede hacer que tu sistema pase de ser un dashboard interesante a una herramienta de inteligencia territorial realmente defendible.