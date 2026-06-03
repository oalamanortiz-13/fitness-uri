# Funcionalidades

## Implementadas en producción

### Páginas públicas
- [x] **Landing page** (`index.html`) — hero, features, how-it-works, pricing, CTA, footer
- [x] **Login** (`login.html`) — email/password + recuperación inline de contraseña
- [x] **Registro de trainer** (`register.html`) — auto-registro con trial 14 días
- [x] **Reset contraseña** (`reset-password.html`) — nueva contraseña tras link de email
- [x] **Invitación de cliente** (`invite.html`) — activación de cuenta desde enlace WhatsApp
- [x] **Logo oficial** `Logopreparador.png` (RGBA transparente) en todas las páginas públicas
- [x] **Speed lines** — background `-52deg` animado en páginas auth
- [x] **Animaciones staggered** — logoIn, heroIn, cardIn con cubic-bezier

---

### Portal del cliente (`client.html`)

#### Navegación
- [x] **Barra de nav inferior** con 7 secciones: Inicio, Entreno, Nutrición, Cardio, Progreso, Calendario, IA
- [x] **Swipe horizontal** para navegar entre secciones (touch, threshold 40px, 400ms)
- [x] **Animaciones de entrada** al cambiar sección (cardIn staggered 55ms)

#### Dashboard (Inicio)
- [x] **Score ring SVG** — anillo animado con % del día, mini-barras por componente
- [x] **Métricas del día** — pasos, cardio, peso (con iconos decorativos)
- [x] **Perfil** — avatar del cliente, nombre, logo trainer, tag objetivo

#### Entrenamiento
- [x] **Plan de ejercicios** por día con series/reps y cargas
- [x] **Muscle group badges** — Push/Pull/Piernas/Core/Cardio detectados por regex
- [x] **Registro de cargas por serie** (JSONB en daily_logs)
- [x] **Botón "Finalizar entreno"** — one-per-day, modal de resultado con score
- [x] **Instrucciones del día** — nota del trainer visible en la tarjeta del día

#### Nutrición
- [x] **Plan de comidas** con bloques y alimentos
- [x] **Checkbox de alimentos** — marca cada alimento, actualiza score nutrición
- [x] **Suplementos** — agrupados por horario (mañana/tarde/noche/pre/post), suman proteína
- [x] **Botón "Finalizar nutrición"** — one-per-day, modal de resultado
- [x] **Instrucciones de nutrición** — caja azul al inicio de sección

#### Cardio
- [x] **Registro de pasos y minutos** — actualiza score cardio
- [x] **Tipos de cardio** — 14 opciones con iconos, agrupadas visualmente
- [x] **Recordatorio anti-sedentarismo** — intervalo configurable (por trainer o cliente)
- [x] **Botón "Finalizar cardio"** — one-per-day, modal de resultado
- [x] **Instrucciones de cardio** — caja azul al inicio de sección

#### Progreso
- [x] **2 slots de fotos de progreso** — upload, preview, persistencia en Supabase Storage
- [x] **Slider % grasa corporal** — guardado en `daily_logs.body_fat_pct` (migración 012)
- [x] **Registro de peso** — guardado en daily_logs

#### Calendario
- [x] **Vista mensual** — % diario bajo cada número, coloreado verde/ámbar/rojo
- [x] **Score por día** — del mes actual, cargado de daily_logs

#### IA
- [x] **Chat de IA** — interfaz de chat (API key pendiente mover a Edge Function proxy)

#### Perfil
- [x] **Upload de avatar** — FileReader preview instantáneo + Storage + update DB
- [x] **Cache-bust** de imágenes con `?t=Date.now()`

---

### Portal del trainer (`trainer.html`)

#### Sidebar
- [x] **Logo trainer** 72px — clickable para subir imagen (camera overlay), persiste en Storage
- [x] **Lista de clientes** con avatar, nombre, estado activo/inactivo
- [x] **Filtro y búsqueda** de clientes

#### Dashboard "Mi Perfil"
- [x] **Métricas de negocio** — activos / inactivos / media 7 días / sin registro hoy
- [x] **Actividad diaria** por cliente con barras de score
- [x] **Ranking semanal** con barras de score
- [x] **Alerta** de clientes sin registrar hoy
- [x] **Formulario colapsable** editar perfil (bio, especialidad, max_clients)
- [x] **Descartar cambios** — snapshot `TRAINER_PROFILE_SNAPSHOT`

#### Tab Perfil del cliente
- [x] **Datos básicos** — edad, altura, peso inicio/objetivo, kcal, proteína
- [x] **Fase, golden rules, notas**
- [x] **Objetivo** (goal_label)
- [x] **Importación masiva** — CSV o Excel, preview, progress bar, credenciales temporales

#### Tab Entreno
- [x] **Editor de días** con ejercicios (series, reps, peso, notas)
- [x] **Edición inline/modal** de ejercicios (botón ✎)
- [x] **Instrucciones por día** — textarea + dictado por voz (Web Speech API, es-ES)
- [x] **Editor de plan con IA** — dictar instrucción → Gemini 2.0 Flash → aplica cambios

#### Tab Nutrición
- [x] **Editor de bloques de comida** con alimentos
- [x] **Drag & drop** para reordenar bloques (handle ⠿, persiste order_index)
- [x] **Edición inline** de alimentos (botón ✎)
- [x] **Instrucciones de nutrición** — textarea + dictado por voz

#### Tab Cardio
- [x] **Objetivos** — pasos diarios, minutos cardio
- [x] **Selector reminder** anti-sedentarismo
- [x] **Gráfica de barras** — pasos diarios (verde=alcanzado)
- [x] **Historial** de sesiones cardio
- [x] **Instrucciones de cardio** — textarea + dictado por voz
- [x] **Tipos de cardio** — 14 opciones asignables al cliente

#### Tab Suplementos
- [x] **Editor de suplementos** con horario (mañana/tarde/noche/pre/post)
- [x] **Tags de color** por horario
- [x] **Edición inline** (botón ✎)
- [x] **Instrucciones de suplementación** — textarea + dictado por voz

#### Tab Medidas
- [x] **Formulario completo** — hombros, pecho, brazos D/I, cintura, cadera, muslos D/I, gemelos D/I
- [x] **Última medición con deltas** vs medición anterior
- [x] **Historial completo** de mediciones
- [x] **Borrar medición** individual

#### Tab Progreso
- [x] **Gráficas de progreso** — peso, composición corporal

---

## Pendiente / Roadmap

### Prioritario
- [ ] **Activar Stripe** — añadir secrets en Supabase Edge Functions:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PRICE_ID`
  - `STRIPE_WEBHOOK_SECRET`
  - `APP_URL`
  - Crear webhook en dashboard Stripe → URL Edge Function
- [ ] **Chat IA seguro** — mover API key de Anthropic desde cliente a Edge Function proxy
- [ ] **Verificar editor IA de plan con Gemini** — si `actions` llega vacío, revisar campo `debug` en respuesta

### Configuración
- [ ] **Confirmar emails automáticamente** — Supabase → Auth → desactivar "Confirm email"

### Futuras features
- [ ] Notificaciones push (recordatorios, nuevos planes)
- [ ] Exportación de informes PDF por cliente
- [ ] Histórico de fotos de progreso (más de 2 slots)
- [ ] Modo offline con sync posterior
- [ ] App nativa (wrapper WebView o React Native)
- [ ] Panel de estadísticas globales para admin
- [ ] Multi-idioma (español/inglés)
- [ ] Módulo compartido para `SUPL_TIMINGS` y `CARDIO_TYPES`
