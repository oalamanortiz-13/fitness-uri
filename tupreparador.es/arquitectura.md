# Arquitectura técnica

## Stack

- **Frontend:** Vanilla HTML5 + CSS3 + JavaScript ES2020 (sin framework)
- **Backend:** Supabase (Auth + PostgreSQL + Storage + Edge Functions)
- **Deploy:** Vercel (estático, push a `main` = deploy automático)
- **Pagos:** Stripe (implementado, pendiente activar en producción)
- **IA:** Gemini 2.0 Flash vía Edge Function `ai-plan-editor`

---

## Portal del cliente (`client.html` + `client-app.js`)

### Estado global
Todo el estado vive en el objeto `S` (definido ~línea 23 de client-app.js):
```js
const S = {
  client: null,         // datos fila clients
  trainerProfile: null, // datos trainer del cliente
  workoutDays: [],      // días de entrenamiento
  dietPlan: [],         // bloques de dieta
  supplements: [],      // suplementos
  todayLog: null,       // log del día actual
  calScores: {},        // scores por fecha {YYYY-MM-DD: {total, training, nutrition, cardio}}
  photoSlot: 0,         // slot de foto de progreso activo
  // ... flags done: trainingDone, nutDone, cardioDone
}
```

### Funciones clave
| Función | Qué hace |
|---------|----------|
| `loadClientData()` | Carga CLIENT, TRAINER_PROFILE, WORKOUT_DAYS, DIET_PLAN, SUPPLEMENTS |
| `loadTodayLog()` | Carga estado del día en S, restaura UI (pasos, cargas, foods, slider grasa) |
| `loadWeekCardio()` | Datos cardio de la semana |
| `loadMonthLogs()` | Scores del mes para el calendario |
| `saveLog()` | Upsert debounced de daily_logs (2s delay vía scheduleSave) |
| `saveScoreComponent(field, value)` | Guarda score parcial, recalcula total preservando otros componentes |
| `updateScoreRing(sc)` | Actualiza anillo SVG animado con score del día |
| `finishWorkout()` / `finishNutrition()` / `finishCardio()` | Botones de completado one-per-day con modal de resultado |
| `finishModal({...})` | Modal compartido de resultado con emoji, título, score |
| `renderWorkout(dayIdx)` | Renderiza ejercicios + badges de grupo muscular + botón finalizar |
| `getMuscleGroup(name)` | Clasifica ejercicio en push/pull/legs/core/cardio por regex |
| `applyClientConfig()` | Aplica datos CLIENT al DOM, incluye `setSedInterval` |
| `applyClientProfile(profile)` | Nombre, avatar (cache-bust `?t=Date.now()`), logo trainer, tags objetivo |
| `uploadAvatar(e)` | Preview instantáneo → upload a Storage → update `clients.avatar_url` |
| `handlePhoto(e)` | Upload foto de progreso a Storage (slot 0/1), preview en UI |
| `loadProgressPhotos()` | Carga fotos de progreso comprobando existencia con HEAD fetch |
| `setSedInterval(min)` / `startSedTimer()` / `resetSedTimer()` | Recordatorio anti-sedentarismo |
| `show(sectionId, btn)` | Navega entre secciones con animaciones staggered |

### Navegación por secciones
Secciones disponibles (en orden de swipe):
```js
const SECTIONS = ['dash', 'train', 'nutri', 'cardio', 'prog', 'cal', 'ai']
```
- Navegación por **swipe horizontal** (táctil): threshold 40px, máx 400ms, ratio horizontal>vertical
- Navegación por **botones de nav** en la barra inferior
- Al cambiar sección: animaciones staggered con `card-anim` (55ms entre elementos)
- Reflow forzado (`void el.offsetWidth`) para reiniciar animaciones CSS

### Score ring (anillo de puntuación)
SVG con `stroke-dasharray` + `stroke-dashoffset`:
- Circunferencia: `2π × 52 ≈ 326.73px`
- Offset: `circumference × (1 - pct/100)` revela el arco correcto
- Colores: verde ≥80%, ámbar ≥50%, rojo >0%, gris 0%
- Transición CSS: 1.4s `cubic-bezier(.4,0,.2,1)`

### Sistema de scores
| Componente | Peso | Cálculo |
|-----------|------|---------|
| Entrenamiento | 40% | ejercicios completados / total |
| Nutrición | 40% | alimentos marcados / total (incluye suplementos con proteína) |
| Cardio | 20% | pasos (60%) + minutos cardio (40%) vs objetivos |

### Formato `loads` en daily_logs
```js
// Formato actual (JSONB):
{ "exId": [kg_s1, kg_s2, kg_s3] }

// Compatibilidad hacia atrás (formato antiguo):
{ "exId": "45" }
// getSetLoads() detecta el tipo y normaliza
```

### Fotos de progreso (Storage)
- Slots: 0 y 1 (dos fotos simultáneas)
- Path: `progress-{USER_ID}-{slot}.{ext}`
- Para comprobar existencia: `fetch(publicUrl, { method: 'HEAD' })` → `resp.ok`
- Al subir: primero eliminar todas las extensiones del slot, luego `upload({ upsert: true })`

---

## Portal del trainer (`trainer.html` + `trainer-app.js`)

### Layout
- Sidebar fija 260px + main scrollable
- En mobile: se apila verticalmente
- Sidebar superior: logo trainer 72px (clickable → upload), nombre trainer

### Flujo principal
```
loadClients() → renderClientList() → click → selectClient(id)
→ loadClientFullData(id) → renderActiveTab()
```

### Tabs del cliente seleccionado
| Tab | `data-tab` | Función render |
|-----|-----------|---------------|
| Perfil | `profile` | `renderProfileTab()` |
| Entreno | `workout` | `renderWorkoutTab()` |
| Nutrición | `nutrition` | `renderNutritionTab()` |
| Cardio | `cardio` | `renderCardioTab()` |
| Suplementos | `supls` | `renderSuplsTab()` |
| Medidas | `measures` | `renderMeasuresTab()` |
| Progreso | `progress` | `renderProgressTab()` |

Detección del tab activo: `b.dataset.tab === tab` (no por texto ni clase).

### Funciones importantes

**Logo trainer:**
- `loadTrainerLogo()` — carga URL desde `trainers.logo_url`
- `applyTrainerLogo(url)` — aplica al `<img>` de 72px en sidebar
- `uploadTrainerLogo(e)` — sube a `trainer-{ID}.ext` en bucket `avatars`

**Perfil del trainer ("Mi Perfil"):**
- Dashboard de negocio con métricas grandes: activos / inactivos / media 7 días / sin registro hoy
- Actividad diaria por cliente
- Ranking semanal con barras de score
- Alerta clientes sin registrar
- Formulario colapsable con snapshot `TRAINER_PROFILE_SNAPSHOT` para descartar cambios
- Al guardar: actualiza snapshot y nombre en sidebar

**Instrucciones y voz:**
- `notesCard(fieldId, value, dbColumn, icon, label)` — genera tarjeta con textarea + mic + guardar
- `saveNotes(dbColumn, fieldId, btn)` — UPDATE directo a `clients`
- `startVoice(targetId, btn)` — toggle SpeechRecognition (continuous, es-ES)
- `_activeRecognition` previene sesiones múltiples

**Medidas corporales:**
- `renderMeasuresTab()` — formulario + última medición con deltas + historial
- `saveMeasurement()` — INSERT en `body_measurements`
- `deleteMeasurement(id)` — DELETE de `body_measurements`
- Orden de campos UI: hombros → pecho → brazos D/I → cintura → cadera → muslos D/I → gemelos D/I

**Cardio tab:**
- Objetivos pasos/cardio min, selector reminder, gráfica barras pasos (verde=alcanzado)
- `saveCardioConfig()` — guarda `steps_goal`, `cardio_goal_min`, `reminder_interval_min` en clients

**Drag & drop nutrición:**
- HTML5 nativo (`draggable`), activado solo desde handle `.drag-handle` vía `mousedown`
- Evita conflictos con inputs dentro de las tarjetas
- Persiste `order_index` en base de datos

**Importación masiva:**
- CSV: parseado nativamente
- Excel: SheetJS cargado lazy desde CDN
- Columnas normalizadas (español/inglés)
- Contraseñas auto-generadas si faltan
- Sesión trainer restaurada tras cada `signUp`
- Preview + barra de progreso + descarga de credenciales temporales

**Editor IA de plan:**
- `applyAIInstruction(btn)` — recoge plan de `SELECTED_CLIENT_DATA.workouts` → Edge Function
- Edge Function `ai-plan-editor`: Gemini 2.0 Flash, `verify_jwt:false`
- Acciones: `add_exercise`, `edit_exercise`, `remove_exercise`, `update_day`
- `applyAIPlanActions(actions)` aplica cambios al plan en tiempo real

---

## Constantes compartidas (candidatas a módulo común)

```js
// Definidas en trainer-app.js, duplicadas inline en client-app.js:
const SUPL_TIMINGS = ['mañana', 'tarde', 'noche', 'pre-workout', 'post-workout']
const CARDIO_TYPES = [
  'Caminar', 'Correr', 'Bicicleta', 'Natación', 'Elíptica',
  'Remo', 'Cuerda', 'HIIT', 'Funcional', 'Zumba',
  'Boxeo', 'Yoga', 'Pilates', 'Otro'
]
```

---

## Patrones de arquitectura recurrentes

### Debounce para guardado
```js
let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveLog, 2000)
}
```

### Cache-bust de imágenes
```js
img.src = `${url}?t=${Date.now()}`
```

### Detección de existencia en Storage
```js
const resp = await fetch(publicUrl, { method: 'HEAD' })
if (resp.ok) { /* existe */ }
```

### Restart de animación CSS
```js
el.classList.remove('card-anim')
void el.offsetWidth  // fuerza reflow
el.style.animationDelay = `${i * 55}ms`
el.classList.add('card-anim')
```
