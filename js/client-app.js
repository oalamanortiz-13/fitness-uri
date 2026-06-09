import { supabase } from './supabase-client.js'
import { requireRole, logout } from './auth.js'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const RPE_DESC = ['','Muy fácil','Fácil','Moderado fácil','Moderado','Algo duro','Duro','Muy duro','Extremo','Máximo','Límite absoluto']
const CHECKS = [
  {k:'desayuno',l:'Desayuno con proteína'},
  {k:'movilidad',l:'10 min movilidad/estiramientos'},
  {k:'pasos',l:'Pasos diarios completados'},
  {k:'entreno',l:'Entrenamiento del día'},
  {k:'cardio',l:'Cardio / caminar'},
  {k:'suplementos',l:'Suplementos del día'},
  {k:'levantarse',l:'Levantarse cada 45 min'},
]

let CLIENT = null
let TRAINER_PROFILE = null
let WORKOUT_DAYS = []
let DIET_PLAN = null
let DIET_MEALS = []
let SUPPLEMENTS = []
let USER_ID = null
let CLIENT_NAME = '—'

let S = {
  curDay: 0,
  curDietDay: 0,
  foods: [],
  steps: 0,
  cardioDay: 0,
  cardioWk: [0,0,0,0,0,0,0],
  exDone: {},
  loads: {},
  calDays: {},
  calScores: {},
  trainingDone: false,
  nutDone: false,
  cardioDone: false,
  rpe: 0,
  checklist: {},
  foodsChecked: [],
  timerSecs: 90,
  timerLeft: 90,
  timerRunning: false,
  timerInt: null,
  sedIntervalMin: 45,
  sedLeft: 2700,
  sedRunning: false,
  sedInt: null,

  streak: 0,
  photoSlot: 0,
  chatHistory: [],
  pesos: [],
}

let saveTimeout = null
let pesoChart = null

const VAPID_PUBLIC_KEY = 'BGe-gg91RY7uCLnoDRni7-cPamj9dwoQD1Bu7ERlDUfHgDXpmPrddKJPdB70Vuk0U7Lb1tu4qkA7BTPJtkSMRv4'

// ─── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireRole('client')
  if (!auth) return
  USER_ID = auth.session.user.id

  await loadClientData()
  await loadTodayLog()
  await loadWeekCardio()
  await loadPesoHistory()

  applyClientConfig()
  renderChecklist()
  renderRPE()
  renderWkBars()
  renderDaySel()
  renderWorkout(S.curDay)
  renderNutrition()
  renderCalendar()
  setAIGreeting()
  updateNutriFinishBtn()
  updateCardioFinishBtn()
  loadProgressPhotos()

  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'})

  document.getElementById('loading-screen').style.display = 'none'
  document.getElementById('app').style.display = 'block'
  document.getElementById('bottom-nav').style.display = 'flex'
  const hdr = document.getElementById('client-header')
  if (hdr) hdr.style.display = 'flex'

  // Register push notifications after UI is visible (non-blocking)
  registerPushNotifications()

  // Limpiar badge del icono PWA al abrir la app
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {})

  // Limpiar badge también cada vez que la app vuelve al primer plano
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && 'clearAppBadge' in navigator) {
      navigator.clearAppBadge().catch(() => {})
    }
  })

  // Trigger dashboard card entrance animation on first load
  requestAnimationFrame(() => {
    document.querySelectorAll('#dash .card, #dash .score-ring-card, #dash .metric-grid').forEach((el, i) => {
      el.style.animationDelay = `${i * 60}ms`
      el.classList.add('card-anim')
    })
    // Animate score ring after a brief delay so transition is visible
    setTimeout(() => {
      const today = getToday()
      updateScoreRing(S.calScores[today] || calcDayScore())
    }, 300)
  })
})

window.doLogout = logout

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      await supabase.from('push_subscriptions').upsert({ client_id: USER_ID, subscription: existing.toJSON() })
      return
    }
    // Si ya tiene permiso concedido, suscribir directamente
    if (Notification.permission === 'granted') {
      await _subscribePush(reg)
      return
    }
    // Si aún no ha decidido, mostrar banner para que lo active con gesto
    if (Notification.permission === 'default') {
      showNotifBanner(reg)
    }
  } catch (e) {
    console.warn('Push registration failed:', e)
  }
}

async function _subscribePush(reg) {
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
    })
    await supabase.from('push_subscriptions').upsert({ client_id: USER_ID, subscription: sub.toJSON() })
  } catch (e) {
    console.warn('Push subscribe failed:', e)
  }
}

function showNotifBanner(reg) {
  if (document.getElementById('notif-banner')) return
  const banner = document.createElement('div')
  banner.id = 'notif-banner'
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
      <i class="ti ti-bell" style="font-size:20px;color:var(--blue);flex-shrink:0"></i>
      <span style="font-size:13px;line-height:1.4">Activa las notificaciones para recibir mensajes de tu preparador</span>
    </div>
    <button onclick="window._activarNotifs()" style="background:var(--blue);color:#0c0c0c;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">Activar</button>
    <button onclick="this.closest('#notif-banner').remove()" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:18px;line-height:1;flex-shrink:0;padding:0 4px">×</button>`
  banner.style.cssText = 'display:flex;align-items:center;gap:10px;background:rgba(55,138,221,0.1);border:1px solid rgba(55,138,221,0.25);border-radius:12px;padding:12px 14px;margin-bottom:12px'
  const dash = document.getElementById('dash')
  dash.insertBefore(banner, dash.firstChild)

  window._activarNotifs = async () => {
    const perm = await Notification.requestPermission()
    banner.remove()
    if (perm === 'granted') await _subscribePush(reg)
  }
}

// ─── LOAD DATA ────────────────────────────────────────────────────────────────

async function loadClientData() {
  const { data: clientData } = await supabase
    .from('clients')
    .select('*')
    .eq('id', USER_ID)
    .single()

  if (!clientData) {
    window.location.href = '/onboarding.html'
    return
  }

  CLIENT = clientData

  // Cargar perfil del cliente (nombre)
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', USER_ID)
    .single()

  // Cargar datos del preparador
  if (clientData?.trainer_id) {
    const { data: trainerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', clientData.trainer_id)
      .single()
    const { data: trainerData } = await supabase
      .from('trainers')
      .select('logo_url')
      .eq('id', clientData.trainer_id)
      .single()
    TRAINER_PROFILE = { ...trainerProfile, ...trainerData }
  }

  // Aplicar perfil visual
  applyClientProfile(myProfile)

  const { data: woDays } = await supabase
    .from('workout_days')
    .select('*, workout_exercises(*)')
    .eq('client_id', USER_ID)
    .order('day_index')
  WORKOUT_DAYS = woDays || []
  for (const d of WORKOUT_DAYS) {
    d.workout_exercises.sort((a, b) => a.order_index - b.order_index)
  }

  const { data: dietData } = await supabase
    .from('diet_plans')
    .select('*, diet_meals(*, diet_foods(*))')
    .eq('client_id', USER_ID)
    .eq('active', true)
    .single()
  DIET_PLAN = dietData
  DIET_MEALS = dietData?.diet_meals || []
  for (const m of DIET_MEALS) {
    m.diet_foods.sort((a, b) => a.order_index - b.order_index)
  }
  DIET_MEALS.sort((a, b) => a.order_index - b.order_index)
  S.curDietDay = getTodayIdx()

  const { data: supls } = await supabase
    .from('supplements')
    .select('*')
    .eq('client_id', USER_ID)
    .order('order_index')
  SUPPLEMENTS = supls || []
}

async function loadTodayLog() {
  const today = getToday()
  const { data: log } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('client_id', USER_ID)
    .eq('log_date', today)
    .single()

  if (!log) return

  S.checklist = log.checklist || {}
  S.steps = log.steps || 0
  S.cardioDay = log.cardio_min || 0
  S.rpe = log.rpe || 0
  S.exDone[`d${getTodayIdx()}`] = log.exercises_done || []
  S.loads[getTodayIdx()] = log.loads || {}
  S.foodsChecked = log.foods_checked || []
  S.trainingDone = log.score_training != null
  S.nutDone = log.score_nutrition != null
  S.cardioDone = log.score_cardio != null
  if (log.score != null) {
    S.calScores[getToday()] = { total: log.score, training: log.score_training, nutrition: log.score_nutrition, cardio: log.score_cardio }
  }

  if (log.weight_kg) {
    document.getElementById('d-peso').textContent = log.weight_kg.toFixed(1) + ' kg'
  }

  // Steps
  updateStepsUI(S.steps)

  // Cardio slider
  document.getElementById('cardio-sl').value = S.cardioDay
  updateCardioUI(S.cardioDay)

  // Body fat slider
  if (log.body_fat_pct != null) {
    const sl = document.getElementById('bf-sl')
    if (sl) {
      sl.value = log.body_fat_pct
      document.getElementById('bf-pct').textContent = log.body_fat_pct + '%'
    }
  }

  // Update score ring from loaded data (or live calc if no stored score)
  if (S.calScores[today]) {
    updateScoreRing(S.calScores[today])
  }
}

async function loadWeekCardio() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('log_date, cardio_min, calendar_status, score, score_training, score_nutrition, score_cardio')
    .eq('client_id', USER_ID)
    .gte('log_date', monday.toISOString().split('T')[0])
    .lte('log_date', sunday.toISOString().split('T')[0])

  if (!logs) return
  for (const log of logs) {
    const d = new Date(log.log_date + 'T12:00:00')
    const idx = (d.getDay() + 6) % 7
    S.cardioWk[idx] = log.cardio_min || 0
    if (log.calendar_status) {
      S.calDays[log.log_date] = log.calendar_status
    }
    if (log.score != null) {
      S.calScores[log.log_date] = { total: log.score, training: log.score_training, nutrition: log.score_nutrition, cardio: log.score_cardio }
    }
  }

  // Calcular racha
  let streak = 0
  const check = new Date()
  for (let i = 0; i < 60; i++) {
    const key = check.toISOString().split('T')[0]
    if (S.calDays[key] === 'done') { streak++ } else break
    check.setDate(check.getDate() - 1)
  }
  S.streak = streak
}

async function loadMonthLogs() {
  const now = new Date()
  const yr = now.getFullYear(), mo = now.getMonth()
  const from = `${yr}-${String(mo + 1).padStart(2, '0')}-01`
  const lastDay = new Date(yr, mo + 1, 0).getDate()
  const to = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('log_date, calendar_status, score, score_training, score_nutrition, score_cardio')
    .eq('client_id', USER_ID)
    .gte('log_date', from)
    .lte('log_date', to)

  if (!logs) return
  for (const log of logs) {
    if (log.calendar_status) S.calDays[log.log_date] = log.calendar_status
    if (log.score != null) {
      S.calScores[log.log_date] = { total: log.score, training: log.score_training, nutrition: log.score_nutrition, cardio: log.score_cardio }
    }
  }
}

function calcDayScore() {
  const todayIdx = getTodayIdx()
  const wo = WORKOUT_DAYS.find(d => d.day_index === todayIdx)
  const key = `d${todayIdx}`

  // Training score (40%)
  const totalEx = wo?.workout_exercises?.length || 0
  const doneEx = S.exDone[key]?.length || 0
  const trainingScore = totalEx > 0 ? Math.round(doneEx / totalEx * 100) : 100

  // Nutrition score (40%): foods + protein supplements checked vs total (today's day only)
  const _nutMeals = DIET_MEALS.filter(m => (m.day_index ?? 0) === getTodayIdx())
  const totalFoods = _nutMeals.reduce((a, m) => a + m.diet_foods.length, 0)
  const totalProtSupls = SUPPLEMENTS.filter(s => s.protein_g > 0).length
  const checkedFoods = S.foodsChecked.filter(id =>
    _nutMeals.some(m => m.diet_foods.some(f => f.id === id))
  ).length
  const checkedProtSupls = S.foodsChecked.filter(id =>
    SUPPLEMENTS.some(s => s.protein_g > 0 && s.id === id)
  ).length
  const totalNut = totalFoods + totalProtSupls
  const checkedNut = checkedFoods + checkedProtSupls
  const nutritionScore = totalNut > 0 ? Math.round(checkedNut / totalNut * 100) : 100

  // Cardio score (20%): steps 60% + cardio 40%
  const stepsGoal = CLIENT?.steps_goal || 9000
  const dailyCardioGoal = (CLIENT?.cardio_goal_min || 185) / 7
  const stepsScore = Math.min(100, Math.round(S.steps / stepsGoal * 100))
  const cardioScore = Math.min(100, Math.round(S.cardioDay / dailyCardioGoal * 100))
  const cardioTotal = Math.round(stepsScore * 0.6 + cardioScore * 0.4)

  const total = Math.round(trainingScore * 0.4 + nutritionScore * 0.4 + cardioTotal * 0.2)

  return { total, training: trainingScore, nutrition: nutritionScore, cardio: cardioTotal }
}

async function loadPesoHistory() {
  const { data: logs } = await supabase
    .from('daily_logs')
    .select('log_date, weight_kg')
    .eq('client_id', USER_ID)
    .not('weight_kg', 'is', null)
    .order('log_date', { ascending: true })
    .limit(30)

  if (!logs) return
  S.pesos = logs.map(l => ({
    v: l.weight_kg,
    d: new Date(l.log_date + 'T12:00:00').toLocaleDateString('es-ES', {day:'numeric', month:'short'})
  }))

  if (S.pesos.length > 0) {
    const last = S.pesos[S.pesos.length - 1]
    document.getElementById('d-peso').textContent = last.v.toFixed(1) + ' kg'
    document.getElementById('peso-hist').innerHTML = S.pesos.slice(-4).map(p =>
      `<span style="margin-right:8px">${p.d}: <b>${p.v}</b> kg</span>`
    ).join('')
  }
}

// ─── CLIENT PROFILE ───────────────────────────────────────────────────────────

function applyClientProfile(myProfile) {
  // Nombre del cliente
  const name = myProfile?.full_name || '—'
  CLIENT_NAME = name
  document.getElementById('profile-name').textContent = name

  // Avatar del cliente — no hay cache-bust en la carga inicial (es la URL guardada)
  if (CLIENT?.avatar_url) {
    const img = document.getElementById('client-avatar-img')
    img.src = CLIENT.avatar_url
    img.style.display = 'block'
    document.getElementById('client-avatar-icon').style.display = 'none'
  }

  // Preparador
  document.getElementById('profile-trainer').textContent = TRAINER_PROFILE?.full_name || '—'

  // Logo del preparador
  if (TRAINER_PROFILE?.logo_url) {
    const img = document.getElementById('trainer-logo-img')
    img.src = TRAINER_PROFILE.logo_url
    img.style.display = 'block'
    document.getElementById('trainer-logo-icon').style.display = 'none'
  }
}

function setAvatarImg(url) {
  const img = document.getElementById('client-avatar-img')
  // Cache-bust para que el cambio de foto se vea inmediatamente
  img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()
  img.style.display = 'block'
  document.getElementById('client-avatar-icon').style.display = 'none'
}

window.uploadAvatar = async function(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { showNotif('Imagen demasiado grande (máx. 5 MB)'); return }

  // Preview inmediato antes de subir
  const reader = new FileReader()
  reader.onload = ev => setAvatarImg(ev.target.result)
  reader.readAsDataURL(file)

  showNotif('Subiendo foto...')

  // Siempre la misma ruta fija para que el upsert sobreescriba sin acumular archivos
  const path = `client-${USER_ID}`

  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) { showNotif('Error al subir la foto.'); return }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

  const { error: dbErr } = await supabase.from('clients').update({ avatar_url: publicUrl }).eq('id', USER_ID)
  if (dbErr) { showNotif('Error al guardar la foto.'); console.error(dbErr); return }
  if (CLIENT) CLIENT.avatar_url = publicUrl

  // Actualizar con URL real (ya con cache-bust)
  setAvatarImg(publicUrl)
  showNotif('Foto guardada ✓')
  e.target.value = ''
}

// ─── APPLY CLIENT CONFIG ──────────────────────────────────────────────────────

function applyClientConfig() {
  if (!CLIENT) return

  // Métricas objetivo
  document.getElementById('d-prot-sub').textContent = `Obj: ${CLIENT.protein_goal} g`
  document.getElementById('d-steps-sub').textContent = `Obj: ${CLIENT.steps_goal?.toLocaleString('es-ES')}`
  document.getElementById('nut-kcal').textContent = CLIENT.kcal_goal?.toLocaleString('es-ES')
  document.getElementById('nut-prot').textContent = CLIENT.protein_goal + ' g'
  document.getElementById('steps-goal-lbl').textContent = `Obj: ${CLIENT.steps_goal?.toLocaleString('es-ES')}`
  document.getElementById('wk-cardio-goal').textContent = CLIENT.cardio_goal_min || 185

  // Fase / semana
  const planStart = CLIENT.plan_start_date ? new Date(CLIENT.plan_start_date) : new Date()
  const diffMs = new Date() - planStart
  const weekNum = Math.max(1, Math.min(CLIENT.plan_weeks || 12, Math.ceil(diffMs / 604800000)))
  const phaseText = `${CLIENT.phase_name || 'Fase 1'} — Sem. ${weekNum}/${CLIENT.plan_weeks || 12}`
  ;['phase-label', 'phase-label-dash'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.textContent = phaseText
  })
  ;['phase-pill', 'header-phase'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.display = 'inline-flex'
  })

  // Día actual - buscar workout del día
  const todayIdx = getTodayIdx()
  const todayWO = WORKOUT_DAYS.find(d => d.day_index === todayIdx)
  document.getElementById('dash-day-title').textContent = todayWO?.title || 'Descanso'
  S.curDay = todayIdx

  // Objetivo de peso
  document.getElementById('d-peso-sub').textContent = `Obj: ${CLIENT.weight_goal || '—'}`

  // Proyección (adaptada a ganancia o pérdida según objetivo)
  const weightStart = parseFloat(CLIENT.weight_start)
  const weightGoal = parseFloat(CLIENT.weight_goal)
  if (weightStart && weightGoal) {
    const isGain = weightGoal >= weightStart
    const rate = isGain ? 0.25 : 0.5
    const sign = isGain ? '+' : '-'
    document.getElementById('proj-4').textContent = `${sign}${(rate * 4).toFixed(1)} kg`
    document.getElementById('proj-8').textContent = `${sign}${(rate * 8).toFixed(1)} kg`
    document.getElementById('proj-12').textContent = `${sign}${(rate * 12).toFixed(1)} kg`
    if (isGain) {
      document.getElementById('proj-grid').innerHTML = `
        <div class="proj-item"><div class="proj-wk">4 semanas</div><div class="proj-val" id="proj-4">${sign}${(rate*4).toFixed(1)} kg</div><div class="proj-desc">Adaptación neuromuscular</div></div>
        <div class="proj-item"><div class="proj-wk">8 semanas</div><div class="proj-val" id="proj-8">${sign}${(rate*8).toFixed(1)} kg</div><div class="proj-desc">Masa ganada visible</div></div>
        <div class="proj-item"><div class="proj-wk">12 semanas</div><div class="proj-val" id="proj-12">${sign}${(rate*12).toFixed(1)} kg</div><div class="proj-desc">Objetivo conseguido</div></div>
      `
    }
  }

  // Objetivo del cliente en perfil
  const goalTags = []
  if (CLIENT.goal_label) {
    goalTags.push(CLIENT.goal_label)
  } else {
    if (CLIENT.weight_goal) goalTags.push(`🎯 Objetivo: ${CLIENT.weight_goal} kg`)
    if (CLIENT.phase_name) goalTags.push(CLIENT.phase_name)
    if (CLIENT.plan_weeks) goalTags.push(`${CLIENT.plan_weeks} semanas`)
  }
  document.getElementById('profile-goal-tags').innerHTML = goalTags
    .map(t => `<span style="font-size:11px;background:#378ADD22;color:var(--blue);border:1px solid #378ADD44;border-radius:20px;padding:3px 8px;white-space:nowrap">${t}</span>`)
    .join('')

  // Reglas de oro
  const rules = CLIENT.golden_rules || []
  document.getElementById('golden-rules').innerHTML = rules.length
    ? rules.map(r => `<div>${r}</div>`).join('')
    : '<div style="color:var(--text3)">Sin reglas asignadas</div>'

  // Tipos de cardio recomendados por el trainer
  const CARDIO_TYPE_LABELS = {
    correr:     { label: 'Correr',           icon: 'ti-run'              },
    caminar:    { label: 'Caminar rápido',   icon: 'ti-walk'             },
    cinta:      { label: 'Cinta',            icon: 'ti-treadmill'        },
    eliptica:   { label: 'Elíptica',         icon: 'ti-arrows-right-left'},
    bici:       { label: 'Bici estática',    icon: 'ti-bike'             },
    spinning:   { label: 'Spinning',         icon: 'ti-brand-cycling'    },
    remo:       { label: 'Remo',             icon: 'ti-ripple'           },
    natacion:   { label: 'Natación',         icon: 'ti-swim'             },
    escaladora: { label: 'Escaladora',       icon: 'ti-stairs-up'        },
    comba:      { label: 'Comba',            icon: 'ti-circles-relation' },
    hiit:       { label: 'HIIT',             icon: 'ti-flame'            },
    boxing:     { label: 'Boxeo / saco',     icon: 'ti-ball-american-football'},
    step:       { label: 'Step aeróbic',     icon: 'ti-steps'            },
    senderismo: { label: 'Senderismo',       icon: 'ti-mountain'         },
  }
  const ctypes = CLIENT.cardio_types || []
  const ctEl = document.getElementById('cardio-types-list')
  if (ctEl) {
    ctEl.innerHTML = ctypes.length
      ? ctypes.map(id => {
          const t = CARDIO_TYPE_LABELS[id] || { label: id, icon: 'ti-run' }
          return `<div class="pill pill-s" style="display:inline-flex;align-items:center;gap:5px"><i class="ti ${t.icon}"></i>${t.label}</div>`
        }).join('')
      : '<span style="font-size:12px;color:var(--text3)">Tu preparador no ha asignado tipos todavía</span>'
  }

  // Instrucciones del trainer por sección
  renderInstructionBox('diet-instructions-box', CLIENT.notes_diet)
  renderInstructionBox('cardio-instructions-box', CLIENT.notes_cardio)
  renderInstructionBox('supls-instructions-box', CLIENT.notes_supls)

  // Recordatorio de movimiento — intervalo configurado por trainer o por defecto 45 min
  if (CLIENT.reminder_interval_min) {
    setSedInterval(CLIENT.reminder_interval_min)
  }

  // Chat quick buttons
  document.getElementById('quick-btns').innerHTML = `
    <button class="btn" onclick="quickQ('¿Qué como hoy para llegar a ${CLIENT.protein_goal}g de proteína?')" style="font-size:11px;padding:6px 10px">🍽️ Menú hoy</button>
    <button class="btn" onclick="quickQ('¿Cómo progreso bien esta semana?')" style="font-size:11px;padding:6px 10px">📈 Consejos</button>
    <button class="btn" onclick="quickQ('¿Qué alternativa tiene el ejercicio de hoy?')" style="font-size:11px;padding:6px 10px">🔄 Alternativa</button>
  `
}

function renderInstructionBox(elId, text) {
  const el = document.getElementById(elId)
  if (!el) return
  if (!text || !text.trim()) { el.innerHTML = ''; return }
  el.innerHTML = `
    <div style="background:var(--bg3);border-left:3px solid var(--blue);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:12px;font-size:13px;color:var(--text2);line-height:1.5">
      <div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">
        <i class="ti ti-info-circle"></i> Instrucciones de tu preparador
      </div>
      ${text.replace(/\n/g, '<br>')}
    </div>`
}

// ─── SAVE LOG (debounced) ─────────────────────────────────────────────────────

function scheduleSave() {
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveLog, 2000)
}

async function saveLog() {
  if (!USER_ID) return
  const today = getToday()
  const todayIdx = getTodayIdx()

  const bfVal = parseFloat(document.getElementById('bf-sl')?.value)
  await supabase.from('daily_logs').upsert({
    client_id: USER_ID,
    log_date: today,
    steps: S.steps,
    cardio_min: S.cardioDay,
    rpe: S.rpe || null,
    checklist: S.checklist,
    exercises_done: S.exDone[`d${todayIdx}`] || [],
    loads: S.loads[todayIdx] || {},
    foods_checked: S.foodsChecked,
    body_fat_pct: isNaN(bfVal) ? null : bfVal,
  }, { onConflict: 'client_id,log_date' })
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

window.show = function(id, btn) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'))
  const sec = document.getElementById(id)
  sec.classList.add('active')
  if (btn) btn.classList.add('active')
  if (id === 'train') { renderDaySel(); renderWorkout(S.curDay) }
  if (id === 'prog') renderProg()
  if (id === 'cal') loadMonthLogs().then(renderCalendar)
  if (id === 'cardio') renderWkBars()
  // staggered card entrance animation
  sec.querySelectorAll('.card,.score-ring-card,.metric-grid,.finish-btn').forEach((el, i) => {
    el.classList.remove('card-anim')
    void el.offsetWidth
    el.style.animationDelay = `${i * 55}ms`
    el.classList.add('card-anim')
  })
}

// ─── CHECKLIST ────────────────────────────────────────────────────────────────

function renderChecklist() {
  document.getElementById('daily-checklist').innerHTML = CHECKS.map(c => {
    const done = S.checklist[c.k]
    return `<div class="row">
      <button class="check-btn${done ? ' on' : ''}" onclick="toggleCheck('${c.k}')">${done ? '✓' : ''}</button>
      <span style="font-size:14px;flex:1;margin-left:10px">${c.l}</span>
    </div>`
  }).join('')
}

window.toggleCheck = function(k) {
  S.checklist[k] = !S.checklist[k]
  renderChecklist()
  scheduleSave()
}

// ─── NUTRITION ────────────────────────────────────────────────────────────────

function renderDietDaySel() {
  const sel = document.getElementById('diet-day-sel-client')
  if (!sel) return
  sel.innerHTML = DAYS.map((d, i) =>
    `<button class="${i === S.curDietDay ? 'active' : ''}" onclick="selectDietDay(${i})">${d}</button>`
  ).join('')
}

window.selectDietDay = function(i) {
  S.curDietDay = i
  renderNutrition()
  updateNutriFinishBtn()
}

function renderNutrition() {
  const container = document.getElementById('diet-meals-container')
  const icons = { 'Desayuno': 'ti-coffee', 'Comida': 'ti-soup', 'Merienda': 'ti-apple', 'Cena': 'ti-moon' }
  const isToday = S.curDietDay === getTodayIdx()
  const todayMeals = DIET_MEALS.filter(m => (m.day_index ?? 0) === S.curDietDay)

  renderDietDaySel()

  container.innerHTML = todayMeals.map(meal => {
    const icon = meal.icon || icons[meal.name] || 'ti-salad'
    const foods = meal.diet_foods.map(food => {
      const checked = S.foodsChecked.includes(food.id)
      const interactStyle = isToday ? '' : 'pointer-events:none;opacity:0.7;'
      return `<div class="meal-row row" data-food-id="${food.id}" data-prot="${food.protein_g}" data-kcal="${food.kcal}" onclick="toggleMeal(this)" style="${interactStyle}">
        <button class="check-btn${checked ? ' on' : ''}" aria-label="Marcar">${checked ? '✓' : ''}</button>
        <div style="flex:1;margin-left:10px"><div class="row-name">${food.name}</div></div>
        <div style="text-align:right">
          ${food.protein_g ? `<span class="tag">${food.protein_g}g prot</span>` : ''}
          ${food.kcal ? `<div style="font-size:10px;color:var(--text2);margin-top:2px">~${food.kcal} kcal</div>` : ''}
        </div>
      </div>`
    }).join('')

    return `<div class="card">
      <div class="card-title"><i class="ti ${icon}"></i> ${meal.name}</div>
      ${foods || '<div style="font-size:12px;color:var(--text3)">Sin alimentos asignados</div>'}
    </div>`
  }).join('')

  const suplsEl = document.getElementById('supls-list')
  if (SUPPLEMENTS.length === 0) {
    document.getElementById('supls-card').style.display = 'none'
  } else {
    const TIMING_META = {
      'manana':       { label: 'Mañana',      icon: 'ti-sunrise',   color: '#BA7517' },
      'tarde':        { label: 'Tarde',        icon: 'ti-sun',       color: '#378ADD' },
      'noche':        { label: 'Noche',        icon: 'ti-moon',      color: '#7C5CBF' },
      'pre-workout':  { label: 'Pre-workout',  icon: 'ti-bolt',      color: '#1D9E75' },
      'post-workout': { label: 'Post-workout', icon: 'ti-check',     color: '#E24B4A' },
    }
    // Agrupar por timing; sin timing al final
    const ORDER = ['manana','tarde','noche','pre-workout','post-workout', null]
    const grouped = {}
    SUPPLEMENTS.forEach(s => {
      const key = s.timing || null
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(s)
    })
    let html = ''
    ORDER.forEach(key => {
      const group = grouped[key]
      if (!group?.length) return
      const meta = key ? TIMING_META[key] : null
      if (meta) {
        html += `<div style="display:flex;align-items:center;gap:6px;margin:10px 0 6px;font-size:12px;font-weight:600;color:${meta.color}">
          <i class="ti ${meta.icon}"></i>${meta.label}
        </div>`
      }
      html += group.map(s => {
        const checked = S.foodsChecked.includes(s.id)
        return `<div class="meal-row row" data-food-id="${s.id}" data-prot="${s.protein_g || 0}" data-kcal="${s.kcal || 0}" onclick="toggleMeal(this)">
          <button class="check-btn${checked ? ' on' : ''}" aria-label="Marcar">${checked ? '✓' : ''}</button>
          <div style="flex:1;margin-left:10px"><div class="row-name">${s.name}</div></div>
          ${s.protein_g > 0 ? `<span class="tag" style="margin-right:4px">${s.protein_g}g prot</span>` : ''}
          ${s.dose ? `<span class="tag">${s.dose}</span>` : ''}
        </div>`
      }).join('')
    })
    suplsEl.innerHTML = html
  }

  // Restore checked state primero, luego actualizar totales
  document.querySelectorAll('.meal-row').forEach(row => {
    const id = row.dataset.foodId
    if (id && S.foodsChecked.includes(id)) {
      row.querySelector('.check-btn').classList.add('on')
      row.querySelector('.check-btn').textContent = '✓'
      row.style.opacity = '1'
    }
  })
  updateMealTotals()
}

window.toggleMeal = function(row) {
  const btn = row.querySelector('.check-btn')
  const on = btn.classList.toggle('on')
  btn.textContent = on ? '✓' : ''
  row.style.opacity = on ? '1' : '0.6'
  const foodId = row.dataset.foodId
  if (foodId) {
    if (on && !S.foodsChecked.includes(foodId)) S.foodsChecked.push(foodId)
    else S.foodsChecked = S.foodsChecked.filter(id => id !== foodId)
  }
  updateMealTotals()
  scheduleSave()
}

function updateMealTotals() {
  let tp = 0, tk = 0
  // Alimentos del plan marcados
  document.querySelectorAll('.meal-row').forEach(r => {
    if (r.querySelector('.check-btn').classList.contains('on')) {
      tp += parseInt(r.dataset.prot) || 0
      tk += parseInt(r.dataset.kcal) || 0
    }
  })
  // Extras manuales (siempre suman)
  tp += S.foods.reduce((a, f) => a + (f.p || 0), 0)
  tk += S.foods.reduce((a, f) => a + (f.k || 0), 0)

  const protGoal = CLIENT?.protein_goal || 175
  const kcalGoal = CLIENT?.kcal_goal || 2500

  document.getElementById('ms-prot').textContent = `${tp} / ${protGoal} g`
  document.getElementById('ms-kcal').textContent = `${tk} / ${kcalGoal} kcal`
  document.getElementById('ms-prot-bar').style.width = Math.min(100, Math.round(tp / protGoal * 100)) + '%'
  document.getElementById('ms-kcal-bar').style.width = Math.min(100, Math.round(tk / kcalGoal * 100)) + '%'
  document.getElementById('d-prot').textContent = tp + 'g'
  updateNutriFinishBtn()
}

window.addFood = function() {
  const n = document.getElementById('food-name').value.trim()
  const p = parseInt(document.getElementById('food-prot').value) || 0
  const k = parseInt(document.getElementById('food-kcal').value) || 0
  if (!n) return
  S.foods.push({ n, p, k })
  document.getElementById('food-name').value = ''
  document.getElementById('food-prot').value = ''
  document.getElementById('food-kcal').value = ''
  renderExtraFoods()
}

window.removeFood = function(i) {
  S.foods.splice(i, 1)
  renderExtraFoods()
}

function renderExtraFoods() {
  document.getElementById('food-list').innerHTML = S.foods.length
    ? S.foods.map((f, i) =>
        `<div class="row"><span style="font-size:13px;flex:1">${f.n}</span>${f.p ? `<span class="tag" style="margin-right:4px">${f.p}g prot</span>` : ''}${f.k ? `<span class="tag" style="margin-right:6px">${f.k}kcal</span>` : ''}<button class="check-btn" onclick="removeFood(${i})" style="font-size:12px">×</button></div>`
      ).join('')
    : ''
  updateMealTotals()
}

// ─── WORKOUT ──────────────────────────────────────────────────────────────────

function getMuscleGroup(name) {
  const n = (name || '').toLowerCase()
  if (/press|pecho|pectoral|bench|push.?up|fondos|dip|apert|fly/.test(n))
    return { cls: 'muscle-push', icon: 'ti-arrows-horizontal', label: 'Pecho' }
  if (/deltoid|hombro|shoulder|lateral|frontal|militar|press arriba|overhead/.test(n))
    return { cls: 'muscle-push', icon: 'ti-trending-up', label: 'Hombros' }
  if (/trícep|tricep|extens/.test(n))
    return { cls: 'muscle-push', icon: 'ti-arrow-down', label: 'Tríceps' }
  if (/bícep|bicep|curl|remo|jalón|jalón|dominada|pull|espalda|dorsal|remo|trapecio/.test(n))
    return { cls: 'muscle-pull', icon: 'ti-arrows-horizontal', label: 'Espalda' }
  if (/sentailla|squat|pierna|leg|femoral|cuádrip|cuadricep|glúteo|gluteo|lunges|estocada|hip|rumano/.test(n))
    return { cls: 'muscle-legs', icon: 'ti-run', label: 'Piernas' }
  if (/gemelo|calf|pantorril/.test(n))
    return { cls: 'muscle-legs', icon: 'ti-run', label: 'Gemelos' }
  if (/abdomen|abdom|core|plancha|crunch|oblicuo|hipopres/.test(n))
    return { cls: 'muscle-core', icon: 'ti-circle', label: 'Core' }
  if (/cardio|correr|bici|elíptic|remo|saltar|skipping|burpee/.test(n))
    return { cls: 'muscle-cardio', icon: 'ti-heart-rate-monitor', label: 'Cardio' }
  return null
}

function renderDaySel() {
  document.getElementById('day-sel').innerHTML = DAYS.map((d, i) =>
    `<button class="${i === S.curDay ? 'active' : ''}" onclick="selDay(${i})">${d}</button>`
  ).join('')
}

window.selDay = function(i) {
  S.curDay = i
  renderDaySel()
  renderWorkout(i)
}

function renderWorkout(dayIdx) {
  const wo = WORKOUT_DAYS.find(d => d.day_index === dayIdx)
  const key = `d${dayIdx}`
  if (!S.exDone[key]) S.exDone[key] = []

  if (!wo) {
    document.getElementById('workout-content').innerHTML = `
      <div class="card">
        <div class="card-title"><i class="ti ti-moon"></i> Descanso</div>
        <div style="font-size:13px;color:var(--text2)">Día de descanso o actividad libre.</div>
      </div>`
    document.getElementById('loads-list').innerHTML = '<div style="font-size:12px;color:var(--text2)">Sin cargas este día</div>'
    return
  }

  const exs = wo.workout_exercises
  const dc = S.exDone[key].length
  const tot = exs.length

  let h = `<div class="card">
    <div class="card-title"><i class="ti ti-calendar"></i> ${wo.title}</div>
    <div class="pill pill-i" style="margin-bottom:10px"><i class="ti ti-clock"></i> ${wo.duration || '—'}</div>
    ${wo.notes ? `<div style="background:var(--bg3);border-left:3px solid var(--blue);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:12px;font-size:13px;color:var(--text2);line-height:1.5"><i class="ti ti-info-circle" style="color:var(--blue);margin-right:4px"></i>${wo.notes.replace(/\n/g,'<br>')}</div>` : ''}`

  exs.forEach(ex => {
    const done = S.exDone[key].includes(ex.id)
    const mb = getMuscleGroup(ex.name)
    h += `<div class="row" style="${done ? 'opacity:.65' : ''}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
          <span class="row-name">${ex.name}</span>
          ${mb ? `<span class="muscle-badge ${mb.cls}"><i class="ti ${mb.icon}"></i> ${mb.label}</span>` : ''}
        </div>
        ${ex.note ? `<div class="row-note">${ex.note}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span class="tag">${ex.sets_reps}</span>
        <button class="check-btn${done ? ' on' : ''}" onclick="toggleEx('${wo.id}','${ex.id}',${dayIdx})">${done ? '✓' : ''}</button>
      </div>
    </div>`
  })

  const isToday = dayIdx === getTodayIdx()
  const alreadyDone = S.trainingDone && isToday
  h += `<div style="margin-top:10px">
    <div class="lbl"><span>${dc}/${tot} completados</span><span>${tot > 0 ? Math.round(dc / tot * 100) : 0}%</span></div>
    <div class="prog-wrap"><div class="prog-fill" style="width:${tot > 0 ? Math.round(dc / tot * 100) : 0}%;background:var(--green)"></div></div>
  </div>
  <button onclick="finishWorkout()" style="width:100%;margin-top:14px;padding:14px;border-radius:var(--radius-sm);border:none;cursor:pointer;font-size:15px;font-weight:600;
    background:${alreadyDone ? 'var(--bg3)' : (dc===tot && tot>0 && isToday) ? 'var(--green)' : 'var(--bg3)'};
    color:${alreadyDone ? 'var(--green)' : (dc===tot && tot>0 && isToday) ? '#fff' : 'var(--text2)'};
    border:2px solid ${alreadyDone ? 'var(--green)' : (dc===tot && tot>0 && isToday) ? 'var(--green)' : 'var(--border2)'};
    transition:all .2s">
    ${alreadyDone ? `✅ Día completado — ${S.calScores[getToday()]?.total ?? '—'}% hoy` : !isToday ? `👁️ Vista previa (${DAYS[dayIdx]})` : (dc===tot && tot>0 ? '🏆 ¡Listo! Guardar entrenamiento' : `💪 Finalizar entrenamiento (${dc}/${tot})`)}
  </button>
  </div>`

  document.getElementById('workout-content').innerHTML = h
  renderLoads(wo, dayIdx)
}

// ─── SCORE HELPERS ────────────────────────────────────────────────────────────

async function saveScoreComponent(field, value) {
  const today = getToday()
  const sc = S.calScores[today] || {}
  const training  = field === 'training'  ? value : (sc.training  ?? null)
  const nutrition = field === 'nutrition' ? value : (sc.nutrition ?? null)
  const cardio    = field === 'cardio'    ? value : (sc.cardio    ?? null)
  const total = Math.round((training || 0) * 0.4 + (nutrition || 0) * 0.4 + (cardio || 0) * 0.2)
  S.calScores[today] = { total, training, nutrition, cardio }

  await supabase.from('daily_logs').upsert({
    client_id: USER_ID, log_date: today,
    score: total,
    score_training: training,
    score_nutrition: nutrition,
    score_cardio: cardio,
  }, { onConflict: 'client_id,log_date' })

  updateScoreRing({ total, training, nutrition, cardio })
  return { total, training, nutrition, cardio }
}

function updateScoreRing(sc) {
  if (!sc) sc = calcDayScore()
  const circumference = 326.73
  const pct = Math.min(100, Math.max(0, sc.total || 0))
  const offset = circumference * (1 - pct / 100)
  const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : pct > 0 ? 'var(--red)' : 'rgba(0,212,255,0.3)'

  const fill = document.getElementById('ring-fill')
  if (fill) {
    fill.style.strokeDashoffset = offset
    fill.style.stroke = color
  }
  const numEl = document.getElementById('score-num')
  if (numEl) {
    numEl.textContent = pct > 0 ? pct + '%' : '—'
    numEl.style.color = pct > 0 ? color : 'var(--text2)'
  }

  const setMini = (barId, pctId, val, barColor) => {
    const b = document.getElementById(barId)
    const p = document.getElementById(pctId)
    if (b) b.style.width = (val || 0) + '%'
    if (p) p.textContent = val != null ? val + '%' : '—'
    if (b && barColor) b.style.background = barColor
  }
  const trainColor = (sc.training||0) >= 80 ? 'var(--green)' : (sc.training||0) >= 50 ? 'var(--amber)' : 'rgba(0,212,255,0.7)'
  const nutriColor = (sc.nutrition||0) >= 80 ? 'var(--green)' : (sc.nutrition||0) >= 50 ? 'var(--amber)' : 'rgba(0,212,255,0.7)'
  setMini('sb-train', 'sb-train-pct', sc.training, trainColor)
  setMini('sb-nutri', 'sb-nutri-pct', sc.nutrition, nutriColor)
  setMini('sb-cardio', 'sb-cardio-pct', sc.cardio, null)
}

function finishModal({ emoji, title, subtitle, scorePct, scoreColor, extraRows, streak }) {
  const streakRow = streak != null
    ? `<div style="background:var(--bg3);border-radius:8px;padding:10px">
        <div style="font-size:16px;font-weight:700;color:var(--blue)">${streak}</div>
        <div style="font-size:10px;color:var(--text2)">días racha</div>
       </div>` : ''
  const rows = (extraRows || []).map(r =>
    `<div style="background:var(--bg3);border-radius:8px;padding:10px">
      <div style="font-size:16px;font-weight:700;color:${r.color}">${r.val}</div>
      <div style="font-size:10px;color:var(--text2)">${r.label}</div>
     </div>`
  ).join('')
  document.body.insertAdjacentHTML('beforeend', `
    <div id="finish-modal" onclick="if(event.target===this)this.remove()" style="
      position:fixed;inset:0;background:#000a;display:flex;align-items:center;
      justify-content:center;z-index:1000;padding:20px">
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
        padding:28px;max-width:340px;width:100%;text-align:center">
        <div style="font-size:48px;margin-bottom:8px">${emoji}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">${title}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px">${subtitle}</div>
        <div style="background:var(--bg3);border-radius:10px;padding:16px;margin-bottom:16px">
          <div style="font-size:38px;font-weight:800;color:${scoreColor};line-height:1">${scorePct}%</div>
          <div style="font-size:11px;color:var(--text2);margin-top:4px">Puntuación</div>
        </div>
        ${rows || streakRow ? `<div style="display:grid;grid-template-columns:${streakRow ? 'repeat(' + ((extraRows?.length||0)+1) + ',1fr)' : 'repeat(' + (extraRows?.length||1) + ',1fr)'};gap:8px;margin-bottom:20px">${rows}${streakRow}</div>` : ''}
        <button onclick="document.getElementById('finish-modal').remove()" class="btn btn-primary" style="width:100%">Cerrar</button>
      </div>
    </div>`)
}

function updateNutriFinishBtn() {
  const btn = document.getElementById('nutri-finish-btn')
  if (!btn) return

  // Vista previa de otro día — botón desactivado
  if (S.curDietDay !== getTodayIdx()) {
    btn.classList.remove('done')
    btn.style.background = ''
    btn.style.color = 'var(--text3)'
    btn.style.borderColor = ''
    btn.style.opacity = '0.5'
    btn.innerHTML = `<i class="ti ti-eye"></i> Vista previa (${DAYS[S.curDietDay]})`
    btn.disabled = true
    return
  }
  btn.disabled = false
  btn.style.opacity = ''

  const _todayNutMeals = DIET_MEALS.filter(m => (m.day_index ?? 0) === getTodayIdx())
  const totalFoods = _todayNutMeals.reduce((a, m) => a + m.diet_foods.length, 0)
  const checked = S.foodsChecked.filter(id => _todayNutMeals.some(m => m.diet_foods.some(f => f.id === id))).length
  const pct = totalFoods > 0 ? Math.round(checked / totalFoods * 100) : 100
  const sc = S.calScores[getToday()]

  if (S.nutDone) {
    btn.classList.add('done')
    btn.style.background = ''
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = `<i class="ti ti-circle-check"></i> Nutrición guardada — ${sc?.nutrition ?? pct}%`
  } else if (pct >= 80) {
    btn.classList.remove('done')
    btn.style.background = 'rgba(29,158,117,0.18)'
    btn.style.color = '#5DCAA5'
    btn.style.borderColor = 'var(--green)'
    btn.innerHTML = `<i class="ti ti-apple"></i> ¡Plan completado! Guardar nutrición`
  } else {
    btn.classList.remove('done')
    btn.style.background = ''
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = `<i class="ti ti-apple"></i> Guardar nutrición del día (${checked}/${totalFoods} alimentos)`
  }
}

function updateCardioFinishBtn() {
  const btn = document.getElementById('cardio-finish-btn')
  if (!btn) return
  const stepsGoal = CLIENT?.steps_goal || 9000
  const dailyCardioGoal = Math.round((CLIENT?.cardio_goal_min || 185) / 7)
  const stepsPct = Math.min(100, Math.round(S.steps / stepsGoal * 100))
  const cardioPct = Math.min(100, Math.round(S.cardioDay / dailyCardioGoal * 100))
  const pct = Math.round(stepsPct * 0.6 + cardioPct * 0.4)
  const sc = S.calScores[getToday()]

  if (S.cardioDone) {
    btn.classList.add('done')
    btn.style.background = ''
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = `<i class="ti ti-circle-check"></i> Cardio guardado — ${sc?.cardio ?? pct}%`
  } else if (pct >= 80) {
    btn.classList.remove('done')
    btn.style.background = 'rgba(0,212,255,0.12)'
    btn.style.color = 'var(--blue)'
    btn.style.borderColor = 'var(--blue)'
    btn.innerHTML = `<i class="ti ti-run"></i> ¡Objetivo conseguido! Guardar cardio`
  } else {
    btn.classList.remove('done')
    btn.style.background = ''
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = `<i class="ti ti-run"></i> Guardar cardio del día (${S.steps.toLocaleString('es-ES')} pasos · ${S.cardioDay} min)`
  }
}

window.finishNutrition = async function() {
  if (S.nutDone) {
    const sc = S.calScores[getToday()]
    finishModal({ emoji: '✅', title: 'Ya guardaste la nutrición', subtitle: 'Los datos de hoy ya están registrados.',
      scorePct: sc?.nutrition ?? '—', scoreColor: 'var(--green)' })
    return
  }

  clearTimeout(saveTimeout)
  await saveLog()

  const _finishNutMeals = DIET_MEALS.filter(m => (m.day_index ?? 0) === getTodayIdx())
  const totalFoods = _finishNutMeals.reduce((a, m) => a + m.diet_foods.length, 0)
  const checked = S.foodsChecked.filter(id => _finishNutMeals.some(m => m.diet_foods.some(f => f.id === id))).length
  const nutritionScore = totalFoods > 0 ? Math.round(checked / totalFoods * 100) : 100

  const score = await saveScoreComponent('nutrition', nutritionScore)
  S.nutDone = true
  updateNutriFinishBtn()

  const color = nutritionScore >= 80 ? 'var(--green)' : nutritionScore >= 50 ? 'var(--amber)' : 'var(--red)'
  const emoji = nutritionScore >= 80 ? '🥗' : nutritionScore >= 50 ? '👍' : '📝'
  finishModal({
    emoji, scoreColor: color,
    title: nutritionScore >= 80 ? '¡Nutrición completada!' : 'Nutrición guardada',
    subtitle: `${checked} de ${totalFoods} alimentos · Puntuación total del día: ${score.total}%`,
    scorePct: nutritionScore,
    extraRows: [{ val: score.total + '%', label: 'Score día', color: 'var(--blue)' }]
  })
}

window.finishCardio = async function() {
  if (S.cardioDone) {
    const sc = S.calScores[getToday()]
    finishModal({ emoji: '✅', title: 'Ya guardaste el cardio', subtitle: 'Los datos de hoy ya están registrados.',
      scorePct: sc?.cardio ?? '—', scoreColor: 'var(--amber)' })
    return
  }

  clearTimeout(saveTimeout)
  await saveLog()

  const stepsGoal = CLIENT?.steps_goal || 9000
  const dailyCardioGoal = (CLIENT?.cardio_goal_min || 185) / 7
  const stepsPct = Math.min(100, Math.round(S.steps / stepsGoal * 100))
  const cardioPct = Math.min(100, Math.round(S.cardioDay / dailyCardioGoal * 100))
  const cardioScore = Math.round(stepsPct * 0.6 + cardioPct * 0.4)

  const score = await saveScoreComponent('cardio', cardioScore)
  S.cardioDone = true
  updateCardioFinishBtn()

  const color = cardioScore >= 80 ? 'var(--green)' : cardioScore >= 50 ? 'var(--amber)' : 'var(--red)'
  const emoji = cardioScore >= 80 ? '🏃' : cardioScore >= 50 ? '👟' : '🚶'
  finishModal({
    emoji, scoreColor: color,
    title: cardioScore >= 80 ? '¡Objetivo cardio!' : 'Cardio guardado',
    subtitle: `${S.steps.toLocaleString('es-ES')} pasos · ${S.cardioDay} min cardio · Score día: ${score.total}%`,
    scorePct: cardioScore,
    extraRows: [
      { val: stepsPct + '%', label: 'Pasos', color: 'var(--blue)' },
      { val: cardioPct + '%', label: 'Cardio', color: 'var(--amber)' },
    ]
  })
}

window.finishWorkout = async function() {
  const dayIdx = S.curDay
  const today = getToday()
  const todayIdx = getTodayIdx()

  if (dayIdx !== todayIdx) {
    showNotif('Solo puedes completar el entrenamiento de hoy.')
    return
  }

  if (S.trainingDone) {
    const sc = S.calScores[today]
    finishModal({ emoji: '✅', title: 'Ya guardaste el entrenamiento', subtitle: 'Los datos de hoy ya están registrados.',
      scorePct: sc?.training ?? '—', scoreColor: 'var(--green)' })
    return
  }

  const wo = WORKOUT_DAYS.find(d => d.day_index === dayIdx)
  const key = `d${dayIdx}`
  const doneEx = S.exDone[key]?.length || 0
  const tot = wo?.workout_exercises?.length || 0

  clearTimeout(saveTimeout)
  await saveLog()

  const trainingScore = tot > 0 ? Math.round(doneEx / tot * 100) : 100
  const score = await saveScoreComponent('training', trainingScore)

  S.trainingDone = true
  S.calDays[today] = 'done'
  const prev = new Date(); prev.setDate(prev.getDate() - 1)
  S.streak = S.calDays[prev.toISOString().split('T')[0]] === 'done' ? S.streak + 1 : 1

  await supabase.from('daily_logs').upsert({
    client_id: USER_ID, log_date: today, calendar_status: 'done',
  }, { onConflict: 'client_id,log_date' })

  const totalColor = score.total >= 80 ? 'var(--green)' : score.total >= 50 ? 'var(--amber)' : 'var(--red)'
  const emoji = trainingScore === 100 ? '🏆' : trainingScore >= 70 ? '💪' : '📝'
  finishModal({
    emoji, scoreColor: 'var(--green)',
    title: trainingScore === 100 ? '¡Entrenamiento completado!' : 'Entrenamiento guardado',
    subtitle: `${wo?.title || 'Entreno'} · ${doneEx}/${tot} ejercicios · Racha: ${S.streak} 🔥`,
    scorePct: trainingScore,
    extraRows: [
      { val: score.total + '%', label: 'Score día', color: totalColor },
      { val: S.streak + ' 🔥', label: 'Racha', color: 'var(--amber)' },
    ]
  })
  renderWorkout(dayIdx)
  renderCalendar()
}

window.toggleEx = function(woDayId, exId, dayIdx) {
  const key = `d${dayIdx}`
  if (!S.exDone[key]) S.exDone[key] = []
  const idx = S.exDone[key].indexOf(exId)
  idx >= 0 ? S.exDone[key].splice(idx, 1) : S.exDone[key].push(exId)
  renderWorkout(dayIdx)
  scheduleSave()
}

function parseSets(setsReps) {
  const m = (setsReps || '').match(/^(\d+)x/)
  return m ? parseInt(m[1]) : 3
}

function getSetLoads(dayIdx, exId, numSets) {
  const v = S.loads[dayIdx]?.[exId]
  if (Array.isArray(v)) return v
  // compatibilidad con dato antiguo (valor único)
  const single = v || ''
  return Array(numSets).fill(single)
}

window.setSetLoad = function(dayIdx, exId, setIdx, value) {
  if (!S.loads[dayIdx]) S.loads[dayIdx] = {}
  const ex = Object.values(WORKOUT_DAYS.find(d => d.day_index === dayIdx)?.workout_exercises || []).find(e => e.id === exId)
  const numSets = ex ? parseSets(ex.sets_reps) : 3
  if (!Array.isArray(S.loads[dayIdx][exId])) {
    S.loads[dayIdx][exId] = Array(numSets).fill('')
  }
  S.loads[dayIdx][exId][setIdx] = value
  scheduleSave()
}

function renderLoads(wo, dayIdx) {
  if (!S.loads[dayIdx]) S.loads[dayIdx] = {}
  const filtered = wo.workout_exercises.filter(e =>
    !['min', 's', '—', '/'].some(x => (e.sets_reps || '').toLowerCase().includes(x)) &&
    /^\d+x/.test(e.sets_reps || '')
  )
  if (!filtered.length) {
    document.getElementById('loads-list').innerHTML = '<div style="font-size:12px;color:var(--text2)">Sin registro de cargas este día</div>'
    return
  }
  document.getElementById('loads-list').innerHTML = filtered.map(ex => {
    const numSets = parseSets(ex.sets_reps)
    const setLoads = getSetLoads(dayIdx, ex.id, numSets)
    const setInputs = Array.from({ length: numSets }, (_, i) => `
      <div style="text-align:center;flex:1">
        <div style="font-size:9px;color:var(--text2);margin-bottom:3px">S${i + 1}</div>
        <input class="load-input" type="number" placeholder="kg" value="${setLoads[i] || ''}" min="0" max="500" style="width:100%;text-align:center"
          onchange="setSetLoad(${dayIdx},'${ex.id}',${i},this.value)">
      </div>`).join('')
    return `<div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:500;margin-bottom:6px">
        ${ex.name}
        <span style="font-size:11px;color:var(--text2);font-weight:400;margin-left:4px">${ex.sets_reps}</span>
      </div>
      <div style="display:flex;gap:6px">${setInputs}</div>
    </div>`
  }).join('')
}

// ─── PESO ─────────────────────────────────────────────────────────────────────

window.savePeso = async function() {
  const v = parseFloat(document.getElementById('peso-in').value)
  if (isNaN(v) || v < 30 || v > 300) return
  document.getElementById('peso-in').value = ''
  document.getElementById('d-peso').textContent = v.toFixed(1) + ' kg'

  const today = getToday()
  await supabase.from('daily_logs').upsert({
    client_id: USER_ID,
    log_date: today,
    weight_kg: v,
  }, { onConflict: 'client_id,log_date' })

  S.pesos.push({ v, d: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'short'}) })
  document.getElementById('peso-hist').innerHTML = S.pesos.slice(-4).map(p =>
    `<span style="margin-right:8px">${p.d}: <b>${p.v}</b> kg</span>`
  ).join('')
  updatePesoChart()
  showNotif('Peso guardado ✓')
}

function updatePesoChart() {
  const c = document.getElementById('peso-chart')
  if (!c) return
  if (pesoChart) { pesoChart.destroy(); pesoChart = null }
  if (S.pesos.length < 2) return
  pesoChart = new Chart(c, {
    type: 'line',
    data: {
      labels: S.pesos.map(p => p.d),
      datasets: [{
        label: 'Peso',
        data: S.pesos.map(p => p.v),
        borderColor: '#378ADD',
        backgroundColor: '#378ADD22',
        tension: .35,
        pointRadius: 5,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: Math.min(...S.pesos.map(p => p.v)) - 2,
          max: Math.max(...S.pesos.map(p => p.v)) + 2,
          ticks: { color: '#a0a0a0' },
          grid: { color: '#2a2a2a' }
        },
        x: { ticks: { color: '#a0a0a0' }, grid: { color: '#2a2a2a' } }
      }
    }
  })
}

// ─── CARDIO & PASOS ───────────────────────────────────────────────────────────

window.updateSteps = function(v) {
  updateStepsUI(parseInt(v))
  scheduleSave()
}

window.syncStepsNum = function(v) {
  const val = Math.max(0, Math.min(30000, parseInt(v) || 0))
  document.getElementById('steps-sl').value = val
  updateStepsUI(val)
  scheduleSave()
}

function updateStepsUI(v) {
  S.steps = v
  const goal = CLIENT?.steps_goal || 9000
  const inp = document.getElementById('steps-num')
  if (inp && document.activeElement !== inp) inp.value = v
  document.getElementById('steps-sl').value = v
  document.getElementById('steps-bar').style.width = Math.min(100, Math.round(v / goal * 100)) + '%'
  document.getElementById('d-steps').textContent = v.toLocaleString('es-ES')
  updateCardioFinishBtn()
}

window.updateCardio = function(v) {
  updateCardioUI(parseInt(v))
  S.cardioWk[getTodayIdx()] = parseInt(v)
  renderWkBars()
  scheduleSave()
}

function updateCardioUI(v) {
  S.cardioDay = v
  document.getElementById('cardio-big').textContent = v + ' min'
  document.getElementById('cardio-bar').style.width = Math.min(100, Math.round(v / 60 * 100)) + '%'
  updateCardioFinishBtn()
}

function renderWkBars() {
  const max = Math.max(1, ...S.cardioWk)
  const tot = S.cardioWk.reduce((a, b) => a + b, 0)
  const goal = CLIENT?.cardio_goal_min || 185
  document.getElementById('wk-cardio-tot').textContent = tot
  document.getElementById('wk-prog-bar').style.width = Math.min(100, Math.round(tot / goal * 100)) + '%'
  document.getElementById('wk-bars').innerHTML = DAYS.map((d, i) => {
    const h = Math.max(4, Math.round(S.cardioWk[i] / max * 60))
    return `<div class="wk-bar-wrap">
      <div style="font-size:9px;color:var(--text2)">${S.cardioWk[i] || ''}</div>
      <div class="wk-bar${S.cardioWk[i] > 0 ? ' filled' : ''}" style="height:${h}px"></div>
    </div>`
  }).join('')
  document.getElementById('wk-labels').innerHTML = DAYS.map(d =>
    `<div style="flex:1;text-align:center;font-size:9px;color:var(--text2)">${d}</div>`
  ).join('')
}

// ─── RPE ──────────────────────────────────────────────────────────────────────

function renderRPE() {
  document.getElementById('rpe-btns').innerHTML = Array.from({length: 10}, (_, i) => {
    const n = i + 1
    const col = n <= 3 ? 'var(--green)' : n <= 6 ? 'var(--amber)' : 'var(--red)'
    return `<button class="rpe-btn${S.rpe === n ? ' sel' : ''}" onclick="setRPE(${n})"
      style="${S.rpe === n ? `background:${col};border-color:${col};color:#fff` : ''}">${n}</button>`
  }).join('')
  document.getElementById('rpe-desc').textContent = S.rpe
    ? `RPE ${S.rpe}: ${RPE_DESC[S.rpe]}`
    : 'Selecciona tu nivel 1–10'
}

window.setRPE = function(v) {
  S.rpe = v
  renderRPE()
  scheduleSave()
}

// ─── TIMERS ───────────────────────────────────────────────────────────────────

function fmt(s) { return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + s % 60 }

window.setTimer = function(s) {
  S.timerSecs = s; S.timerLeft = s
  clearInterval(S.timerInt); S.timerRunning = false
  document.getElementById('timer-btn').textContent = '▶ Iniciar'
  document.getElementById('timer-disp').textContent = fmt(s)
}

window.startTimer = function() {
  if (S.timerRunning) {
    clearInterval(S.timerInt); S.timerRunning = false
    document.getElementById('timer-btn').textContent = '▶ Iniciar'; return
  }
  S.timerRunning = true
  document.getElementById('timer-btn').textContent = '⏸ Pausar'
  S.timerInt = setInterval(() => {
    if (S.timerLeft <= 0) {
      clearInterval(S.timerInt); S.timerRunning = false
      document.getElementById('timer-btn').textContent = '▶ Iniciar'
      document.getElementById('timer-disp').textContent = '¡Listo! 💪'
      showNotif('¡Descanso terminado! A por la siguiente serie.')
      return
    }
    S.timerLeft--
    document.getElementById('timer-disp').textContent = fmt(S.timerLeft)
  }, 1000)
}

window.resetTimer = function() {
  clearInterval(S.timerInt); S.timerRunning = false; S.timerLeft = S.timerSecs
  document.getElementById('timer-btn').textContent = '▶ Iniciar'
  document.getElementById('timer-disp').textContent = fmt(S.timerSecs)
}

window.setSedInterval = function(min) {
  clearInterval(S.sedInt); S.sedRunning = false
  S.sedIntervalMin = min
  S.sedLeft = min * 60
  document.getElementById('sed-btn').textContent = '▶ Activar'
  document.getElementById('sed-disp').textContent = fmt(S.sedLeft)
  ;[20, 30, 45, 60].forEach(m => {
    const btn = document.getElementById(`sed-pre-${m}`)
    if (btn) btn.classList.toggle('active', m === min)
  })
}

window.startSedTimer = function() {
  if (S.sedRunning) {
    clearInterval(S.sedInt); S.sedRunning = false
    document.getElementById('sed-btn').textContent = '▶ Activar'
    return
  }
  S.sedRunning = true
  document.getElementById('sed-btn').textContent = '⏸ Pausar'
  S.sedInt = setInterval(() => {
    if (S.sedLeft <= 0) {
      clearInterval(S.sedInt); S.sedRunning = false
      S.sedLeft = S.sedIntervalMin * 60
      document.getElementById('sed-btn').textContent = '▶ Activar'
      document.getElementById('sed-disp').textContent = '🚶 ¡Levántate!'
      showNotif(`¡${S.sedIntervalMin} min sentado! Levántate y camina un poco 🚶`)
      return
    }
    S.sedLeft--
    document.getElementById('sed-disp').textContent = fmt(S.sedLeft)
  }, 1000)
}

window.resetSedTimer = function() {
  clearInterval(S.sedInt); S.sedRunning = false
  S.sedLeft = S.sedIntervalMin * 60
  document.getElementById('sed-disp').textContent = fmt(S.sedLeft)
  document.getElementById('sed-btn').textContent = '▶ Activar'
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────

function renderCalendar() {
  const now = new Date()
  const yr = now.getFullYear(), mo = now.getMonth()
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  document.getElementById('cal-month-title').textContent = `${months[mo]} ${yr}`

  const first = new Date(yr, mo, 1).getDay()
  const offset = first === 0 ? 6 : first - 1
  const days = new Date(yr, mo + 1, 0).getDate()
  const g = document.getElementById('cal-grid')
  g.innerHTML = ''

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div'); e.className = 'cal-day empty'; g.appendChild(e)
  }
  for (let d = 1; d <= days; d++) {
    const el = document.createElement('div')
    const key = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const st = S.calDays[key]
    const sc = S.calScores[key]
    el.className = 'cal-day' + (st === 'done' ? ' done' : st === 'miss' ? ' miss' : '') + (d === now.getDate() ? ' today-c' : '')
    if (st === 'done' && sc?.total != null) {
      const pctColor = sc.total >= 80 ? '#1D9E75' : sc.total >= 50 ? '#BA7517' : '#E24B4A'
      el.innerHTML = `<span style="display:block;font-size:12px;font-weight:600">${d}</span><span style="display:block;font-size:9px;color:${pctColor};font-weight:700;line-height:1">${sc.total}%</span>`
    } else {
      el.textContent = d
    }
    g.appendChild(el)
  }

  const done = Object.values(S.calDays).filter(v => v === 'done').length
  const passed = now.getDate()
  document.getElementById('cal-streak-big').textContent = S.streak
  document.getElementById('cal-done').textContent = done
  document.getElementById('cal-adher').textContent = Math.round(done / passed * 100) + '%'
  document.getElementById('d-streak').textContent = S.streak + ' 🔥'
}

window.markToday = async function(done) {
  const today = getToday()
  S.calDays[today] = done ? 'done' : 'miss'

  if (done) {
    const prev = new Date(); prev.setDate(prev.getDate() - 1)
    const pk = prev.toISOString().split('T')[0]
    S.streak = S.calDays[pk] === 'done' ? S.streak + 1 : 1
  } else {
    S.streak = 0
  }

  renderCalendar()

  await supabase.from('daily_logs').upsert({
    client_id: USER_ID,
    log_date: today,
    calendar_status: done ? 'done' : 'miss',
  }, { onConflict: 'client_id,log_date' })

  if (done) showNotif('¡Día completado! Racha: ' + S.streak + ' días 🔥')
}

// ─── PROGRESO ─────────────────────────────────────────────────────────────────

function renderProg() {
  updatePesoChart()
  const tot = S.cardioWk.reduce((a, b) => a + b, 0)
  const ex = Object.values(S.exDone).reduce((a, v) => a + v.length, 0)
  const done = Object.values(S.calDays).filter(v => v === 'done').length
  const goal = CLIENT?.cardio_goal_min || 185
  document.getElementById('weekly-summary').innerHTML = `<div class="metric-grid">
    <div class="metric"><div class="metric-label">Cardio semanal</div><div class="metric-val">${tot}'</div><div class="metric-sub">/ ${goal} min</div></div>
    <div class="metric"><div class="metric-label">Ejercicios hechos</div><div class="metric-val">${ex}</div><div class="metric-sub">esta semana</div></div>
    <div class="metric"><div class="metric-label">Días completados</div><div class="metric-val">${done}</div><div class="metric-sub">este mes</div></div>
    <div class="metric"><div class="metric-label">Pasos hoy</div><div class="metric-val">${S.steps.toLocaleString('es-ES')}</div><div class="metric-sub">/ ${(CLIENT?.steps_goal || 9000).toLocaleString('es-ES')}</div></div>
  </div>`
}

window.triggerPhoto = function(slot) {
  S.photoSlot = slot
  document.getElementById('photo-input').click()
}

window.handlePhoto = async function(e) {
  const f = e.target.files[0]; if (!f) return
  if (f.size > 10 * 1024 * 1024) { showNotif('Imagen demasiado grande (máx. 10 MB)'); return }

  const slot = S.photoSlot
  const el = document.getElementById(`photo-${slot}`)

  // Preview inmediato
  const reader = new FileReader()
  reader.onload = ev => {
    el.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
  }
  reader.readAsDataURL(f)

  showNotif('Subiendo foto...')

  const path = `progress-${USER_ID}-${slot}`
  const ext = f.name.split('.').pop() || 'jpg'
  const fullPath = `${path}.${ext}`

  // Borrar el anterior (si existe con otra extensión) e ignorar error
  await supabase.storage.from('avatars').remove([`${path}.jpg`, `${path}.jpeg`, `${path}.png`, `${path}.webp`])

  const { error } = await supabase.storage
    .from('avatars')
    .upload(fullPath, f, { upsert: true, contentType: f.type })

  if (error) { showNotif('Error al guardar la foto'); console.error(error); return }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fullPath)
  el.innerHTML = `<img src="${publicUrl}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
  showNotif('Foto guardada ✓')
  e.target.value = ''
}

async function loadProgressPhotos() {
  for (const slot of [0, 1]) {
    const el = document.getElementById(`photo-${slot}`)
    if (!el) continue
    const label = slot === 0 ? 'Esta semana' : 'Semana anterior'
    // Try common extensions
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      const path = `progress-${USER_ID}-${slot}.${ext}`
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Test if the file actually exists
      const resp = await fetch(publicUrl, { method: 'HEAD' })
      if (resp.ok) {
        el.innerHTML = `<img src="${publicUrl}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
        break
      }
    }
  }
}

// ─── CHAT IA ──────────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  if (!CLIENT) return 'Eres un preparador físico y nutricionista experto. Responde en español, de forma concisa.'
  const todayWO = WORKOUT_DAYS.find(d => d.day_index === getTodayIdx())
  return `Eres un preparador físico y nutricionista experto. Estás ayudando a ${CLIENT.notes ? 'un cliente con estas características: ' + CLIENT.notes : 'tu cliente'}.

Objetivos: ${CLIENT.weight_goal ? `Peso objetivo: ${CLIENT.weight_goal}.` : ''} Proteína diaria: ${CLIENT.protein_goal}g. Calorías: ${CLIENT.kcal_goal} kcal/día. Pasos: ${CLIENT.steps_goal}/día.
${todayWO ? `Entrenamiento de hoy: ${todayWO.title} (${todayWO.duration || ''}).` : 'Hoy es día de descanso.'}
Plan de ${CLIENT.plan_weeks || 12} semanas. ${CLIENT.phase_name || 'Fase 1'}.

SIEMPRE: habla en español, respuestas concisas y directas.`
}

function setAIGreeting() {
  const name = CLIENT ? '' : ''
  document.getElementById('ai-greeting').textContent =
    `Hola${name}. Soy tu preparador IA. Estoy al tanto de tu plan completo. ¿Qué necesitas?`
}

window.sendChat = async function() {
  const inp = document.getElementById('chat-in')
  const txt = inp.value.trim()
  if (!txt) return
  inp.value = ''
  S.chatHistory.push({ role: 'user', content: txt })
  renderChat()
  const thinking = Object.assign(document.createElement('div'), {
    className: 'msg ai', textContent: '...', id: 'thinking'
  })
  document.getElementById('chat-wrap').appendChild(thinking)
  scrollChat()

  try {
    const res = await fetch('https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: buildSystemPrompt(),
        messages: S.chatHistory
      })
    })
    const data = await res.json()
    const reply = data.reply || 'Error de conexión.'
    S.chatHistory.push({ role: 'assistant', content: reply })
  } catch(e) {
    S.chatHistory.push({ role: 'assistant', content: 'Error de conexión. Inténtalo de nuevo.' })
  }
  renderChat()
}

window.quickQ = function(q) {
  document.getElementById('chat-in').value = q
  sendChat()
}

function renderChat() {
  const t = document.getElementById('thinking'); if (t) t.remove()
  document.getElementById('chat-wrap').innerHTML = S.chatHistory.map(m =>
    `<div class="msg ${m.role === 'user' ? 'user' : 'ai'}">${m.content}</div>`
  ).join('')
  scrollChat()
}

function scrollChat() {
  const c = document.getElementById('chat-wrap'); c.scrollTop = c.scrollHeight
}

// ─── NOTIF ────────────────────────────────────────────────────────────────────

function showNotif(txt) {
  const n = document.getElementById('notif')
  n.textContent = txt; n.style.display = 'block'
  setTimeout(() => n.style.display = 'none', 4000)
}

window.showNotif = showNotif

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getTodayIdx() {
  const d = new Date().getDay()
  return d === 0 ? 6 : d - 1
}

function getToday() {
  return new Date().toISOString().split('T')[0]
}

// Expose S and scheduleSave to inline onchange handlers
window.S = S
window.scheduleSave = scheduleSave

// ─── SWIPE NAVIGATION ────────────────────────────────────────────────────────

const SECTIONS = ['dash', 'train', 'nutri', 'cardio', 'prog', 'cal', 'ai']

;(function initSwipe() {
  let startX = 0, startY = 0, startTime = 0

  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    startTime = Date.now()
  }, { passive: true })

  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX
    const dy = e.changedTouches[0].clientY - startY
    const dt = Date.now() - startTime

    // Only horizontal swipes: dx > 40px, faster than 400ms, more horizontal than vertical
    if (Math.abs(dx) < 40 || dt > 400 || Math.abs(dy) > Math.abs(dx) * 0.8) return

    const activeSec = document.querySelector('.sec.active')
    if (!activeSec) return
    const idx = SECTIONS.indexOf(activeSec.id)
    if (idx === -1) return

    const nextIdx = dx < 0 ? idx + 1 : idx - 1
    if (nextIdx < 0 || nextIdx >= SECTIONS.length) return

    const nextId = SECTIONS[nextIdx]
    const navBtns = document.querySelectorAll('.nav button')
    const targetBtn = navBtns[nextIdx] || null
    show(nextId, targetBtn)
  }, { passive: true })
})()


// ─── PDF EXPORT ───────────────────────────────────────────────────────────────

async function loadJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
  return window.jspdf.jsPDF
}

async function imgToBase64(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// Cache logos between calls
let _pdfLogos = null
async function getPdfLogos() {
  if (_pdfLogos) return _pdfLogos
  const [tpLogo, trainerLogo] = await Promise.all([
    imgToBase64(window.location.origin + '/logo.png'),
    TRAINER_PROFILE?.logo_url ? imgToBase64(TRAINER_PROFILE.logo_url) : Promise.resolve(null)
  ])
  _pdfLogos = { tpLogo, trainerLogo }
  return _pdfLogos
}

function pdfHeader(doc, title, logos) {
  const H = 38
  doc.setFillColor(12, 12, 12)
  doc.rect(0, 0, 210, H, 'F')

  // Logo Tu Preparador (izquierda) — PNG transparente sobre negro
  if (logos?.tpLogo) {
    try { doc.addImage(logos.tpLogo, 'PNG', 10, 5, 48, 18) } catch (_) {}
  } else {
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Tu Preparador', 14, 16)
  }

  // Logo del preparador (derecha) — cuadrado 22x22mm
  if (logos?.trainerLogo) {
    try {
      // Detectar formato desde el data URL
      const fmt = logos.trainerLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(logos.trainerLogo, fmt, 176, 4, 22, 22)
    } catch (_) {}
  }

  // Línea separadora
  doc.setDrawColor(55, 55, 55)
  doc.line(0, H, 210, H)

  // Texto: título y nombre del cliente
  doc.setTextColor(160, 160, 160)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  const trainerName = TRAINER_PROFILE?.full_name || ''
  doc.text(title, 14, H - 5)
  if (CLIENT_NAME && CLIENT_NAME !== '—') {
    const clientLabel = trainerName ? `${CLIENT_NAME}  ·  ${trainerName}` : CLIENT_NAME
    const maxX = logos?.trainerLogo ? 172 : 196
    doc.text(clientLabel, maxX, H - 5, { align: 'right' })
  }
}

function pdfFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(40, 40, 40)
    doc.line(14, 284, 196, 284)
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.setFont('helvetica', 'normal')
    doc.text('Tu Preparador · tupreparador.es', 14, 289)
    doc.text(`Página ${i} / ${pages}`, 196, 289, { align: 'right' })
  }
}

window.downloadWorkoutPDF = async function(btn) {
  const orig = btn.innerHTML
  btn.innerHTML = '<i class="ti ti-loader-2" style="font-size:13px"></i> Generando...'
  btn.disabled = true

  try {
    const [JsPDF, logos] = await Promise.all([loadJsPDF(), getPdfLogos()])
    const doc = new JsPDF({ unit: 'mm', format: 'a4' })
    const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

    pdfHeader(doc, `Plan de entrenamiento · ${date}`, logos)
    let y = 46

    if (!WORKOUT_DAYS.length) {
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(11)
      doc.text('No hay días de entrenamiento asignados.', 14, y)
    }

    WORKOUT_DAYS.forEach((day) => {
      const exs = day.workout_exercises || []
      const blockH = 14 + (day.notes ? 12 : 0) + exs.length * 8 + 10
      if (y + blockH > 278) { doc.addPage(); y = 20 }

      // Cabecera del día
      doc.setFillColor(55, 138, 221)
      doc.roundedRect(14, y, 182, 9, 1.5, 1.5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      const dayLabel = day.title + (day.duration ? `   ·   ${day.duration}` : '')
      doc.text(dayLabel, 18, y + 6.2)
      y += 13

      // Nota del día
      if (day.notes) {
        doc.setFillColor(230, 240, 255)
        const noteLines = doc.splitTextToSize(day.notes, 170)
        const noteH = noteLines.length * 5 + 6
        doc.roundedRect(14, y, 182, noteH, 1, 1, 'F')
        doc.setTextColor(40, 80, 140)
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'italic')
        doc.text(noteLines, 18, y + 5)
        y += noteH + 4
      }

      // Cabecera tabla ejercicios
      doc.setFillColor(238, 238, 238)
      doc.rect(14, y, 182, 6.5, 'F')
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.text('EJERCICIO', 17, y + 4.5)
      doc.text('SERIES / REPS', 193, y + 4.5, { align: 'right' })
      y += 7.5

      exs.forEach((ex, j) => {
        if (y > 272) { doc.addPage(); y = 20 }
        doc.setFillColor(j % 2 === 0 ? 255 : 249, j % 2 === 0 ? 255 : 249, j % 2 === 0 ? 255 : 249)
        const exH = ex.note ? 13 : 8
        doc.rect(14, y, 182, exH, 'F')
        doc.setTextColor(25, 25, 25)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(ex.name, 17, y + 5.5)
        doc.setFont('helvetica', 'bold')
        doc.text(ex.sets_reps || '', 193, y + 5.5, { align: 'right' })
        if (ex.note) {
          doc.setFont('helvetica', 'italic')
          doc.setFontSize(8)
          doc.setTextColor(110, 110, 110)
          doc.text(ex.note, 17, y + 10.5)
        }
        y += exH
      })
      y += 10
    })

    pdfFooter(doc)
    doc.save(`entreno-${(CLIENT_NAME || 'plan').replace(/\s+/g, '-').toLowerCase()}.pdf`)
  } catch (e) {
    console.error('Error generando PDF:', e)
    alert('Error al generar el PDF. Inténtalo de nuevo.')
  } finally {
    btn.innerHTML = orig
    btn.disabled = false
  }
}

window.downloadDietPDF = async function(btn) {
  const orig = btn.innerHTML
  btn.innerHTML = '<i class="ti ti-loader-2" style="font-size:13px"></i> Generando...'
  btn.disabled = true

  try {
    const [JsPDF, logos] = await Promise.all([loadJsPDF(), getPdfLogos()])
    const doc = new JsPDF({ unit: 'mm', format: 'a4' })
    const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

    pdfHeader(doc, `Plan de nutrición · ${date}`, logos)
    let y = 46

    // Objetivos diarios
    const kcal = CLIENT?.kcal_goal
    const prot = CLIENT?.protein_goal
    if (kcal || prot) {
      doc.setFillColor(235, 248, 243)
      doc.roundedRect(14, y, 182, 11, 1.5, 1.5, 'F')
      doc.setTextColor(20, 100, 70)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      const goals = [kcal ? `${kcal} kcal / día` : null, prot ? `${prot}g proteína / día` : null].filter(Boolean).join('   ·   ')
      doc.text(`Objetivo diario: ${goals}`, 18, y + 7.5)
      y += 16
    }

    if (!DIET_MEALS.length) {
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(11)
      doc.text('No hay plan de nutrición asignado.', 14, y)
    }

    DAYS.forEach((dayName, dayIdx) => {
      const dayMeals = DIET_MEALS.filter(m => (m.day_index ?? 0) === dayIdx)
        .slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      if (!dayMeals.length) return

      // Cabecera de día
      if (y + 14 > 278) { doc.addPage(); y = 20 }
      doc.setFillColor(55, 138, 221)
      doc.roundedRect(14, y, 182, 9, 1.5, 1.5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(dayName.toUpperCase(), 18, y + 6.2)
      y += 13

      dayMeals.forEach((meal) => {
        const foods = meal.diet_foods || []
        const blockH = 12 + foods.length * 8 + 8
        if (y + blockH > 278) { doc.addPage(); y = 20 }

        // Cabecera comida
        doc.setFillColor(29, 158, 117)
        doc.roundedRect(14, y, 182, 9, 1.5, 1.5, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text(meal.name, 18, y + 6.2)
        const mealKcal = foods.reduce((s, f) => s + (f.kcal || 0), 0)
        const mealProt = foods.reduce((s, f) => s + (f.protein_g || 0), 0)
        if (mealKcal || mealProt) {
          doc.setFontSize(8)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(200, 240, 220)
          const totals = [mealKcal ? `~${mealKcal} kcal` : null, mealProt ? `${mealProt}g prot` : null].filter(Boolean).join('  ·  ')
          doc.text(totals, 193, y + 6.2, { align: 'right' })
        }
        y += 13

        // Cabecera tabla alimentos
        doc.setFillColor(238, 238, 238)
        doc.rect(14, y, 182, 6.5, 'F')
        doc.setTextColor(80, 80, 80)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'bold')
        doc.text('ALIMENTO', 17, y + 4.5)
        doc.text('PROTEÍNA', 148, y + 4.5, { align: 'right' })
        doc.text('KCAL', 193, y + 4.5, { align: 'right' })
        y += 7.5

        foods.forEach((food, j) => {
          if (y > 276) { doc.addPage(); y = 20 }
          doc.setFillColor(j % 2 === 0 ? 255 : 249, j % 2 === 0 ? 255 : 249, j % 2 === 0 ? 255 : 249)
          doc.rect(14, y, 182, 8, 'F')
          doc.setTextColor(25, 25, 25)
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.text(food.name, 17, y + 5.5)
          doc.setTextColor(90, 90, 90)
          doc.setFontSize(8.5)
          if (food.protein_g) doc.text(`${food.protein_g}g`, 148, y + 5.5, { align: 'right' })
          if (food.kcal) doc.text(`${food.kcal}`, 193, y + 5.5, { align: 'right' })
          y += 8
        })

        if (!foods.length) {
          doc.setTextColor(150, 150, 150)
          doc.setFontSize(8.5)
          doc.setFont('helvetica', 'italic')
          doc.text('Sin alimentos asignados', 17, y + 5)
          y += 9
        }
        y += 8
      })
    })

    // Suplementos
    if (SUPPLEMENTS.length) {
      if (y + 20 > 278) { doc.addPage(); y = 20 }
      doc.setFillColor(55, 138, 221)
      doc.roundedRect(14, y, 182, 9, 1.5, 1.5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Suplementación', 18, y + 6.2)
      y += 13

      doc.setFillColor(238, 238, 238)
      doc.rect(14, y, 182, 6.5, 'F')
      doc.setTextColor(80, 80, 80)
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.text('SUPLEMENTO', 17, y + 4.5)
      doc.text('DOSIS', 148, y + 4.5, { align: 'right' })
      doc.text('MOMENTO', 193, y + 4.5, { align: 'right' })
      y += 7.5

      const TIMING_LABEL = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche', 'pre-workout': 'Pre-workout', 'post-workout': 'Post-workout' }
      SUPPLEMENTS.forEach((s, j) => {
        if (y > 276) { doc.addPage(); y = 20 }
        doc.setFillColor(j % 2 === 0 ? 255 : 249, j % 2 === 0 ? 255 : 249, j % 2 === 0 ? 255 : 249)
        doc.rect(14, y, 182, 8, 'F')
        doc.setTextColor(25, 25, 25)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.text(s.name, 17, y + 5.5)
        doc.setTextColor(90, 90, 90)
        doc.setFontSize(8.5)
        if (s.dose) doc.text(s.dose, 148, y + 5.5, { align: 'right' })
        if (s.timing) doc.text(TIMING_LABEL[s.timing] || s.timing, 193, y + 5.5, { align: 'right' })
        y += 8
      })
    }

    pdfFooter(doc)
    doc.save(`dieta-${(CLIENT_NAME || 'plan').replace(/\s+/g, '-').toLowerCase()}.pdf`)
  } catch (e) {
    console.error('Error generando PDF:', e)
    alert('Error al generar el PDF. Inténtalo de nuevo.')
  } finally {
    btn.innerHTML = orig
    btn.disabled = false
  }
}
