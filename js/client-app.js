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

let S = {
  curDay: 0,
  foods: [],
  steps: 0,
  cardioDay: 0,
  cardioWk: [0,0,0,0,0,0,0],
  exDone: {},
  loads: {},
  calDays: {},
  calScores: {},
  rpe: 0,
  checklist: {},
  foodsChecked: [],
  timerSecs: 90,
  timerLeft: 90,
  timerRunning: false,
  timerInt: null,
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

  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'})

  document.getElementById('loading-screen').style.display = 'none'
  document.getElementById('app').style.display = 'block'
  document.getElementById('bottom-nav').style.display = 'flex'
})

window.doLogout = logout

// ─── LOAD DATA ────────────────────────────────────────────────────────────────

async function loadClientData() {
  const { data: clientData } = await supabase
    .from('clients')
    .select('*')
    .eq('id', USER_ID)
    .single()
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

  if (log.weight_kg) {
    document.getElementById('d-peso').textContent = log.weight_kg.toFixed(1) + ' kg'
  }

  // Steps
  updateStepsUI(S.steps)

  // Cardio slider
  document.getElementById('cardio-sl').value = S.cardioDay
  updateCardioUI(S.cardioDay)
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

  // Nutrition score (40%): foods checked vs total plan foods
  const totalFoods = DIET_MEALS.reduce((a, m) => a + m.diet_foods.length, 0)
  const checkedFoods = S.foodsChecked.filter(id =>
    DIET_MEALS.some(m => m.diet_foods.some(f => f.id === id))
  ).length
  const nutritionScore = totalFoods > 0 ? Math.round(checkedFoods / totalFoods * 100) : 100

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

  await supabase.from('clients').update({ avatar_url: publicUrl }).eq('id', USER_ID)
  if (CLIENT) CLIENT.avatar_url = publicUrl

  // Actualizar con URL real (ya con cache-bust)
  setAvatarImg(publicUrl)
  showNotif('Foto actualizada ✓')
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
  document.getElementById('phase-label').textContent = `${CLIENT.phase_name || 'Fase 1'} — Semana ${weekNum} de ${CLIENT.plan_weeks || 12}`

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

  // Chat quick buttons
  document.getElementById('quick-btns').innerHTML = `
    <button class="btn" onclick="quickQ('¿Qué como hoy para llegar a ${CLIENT.protein_goal}g de proteína?')" style="font-size:11px;padding:6px 10px">🍽️ Menú hoy</button>
    <button class="btn" onclick="quickQ('¿Cómo progreso bien esta semana?')" style="font-size:11px;padding:6px 10px">📈 Consejos</button>
    <button class="btn" onclick="quickQ('¿Qué alternativa tiene el ejercicio de hoy?')" style="font-size:11px;padding:6px 10px">🔄 Alternativa</button>
  `
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
  }, { onConflict: 'client_id,log_date' })
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

window.show = function(id, btn) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'))
  document.getElementById(id).classList.add('active')
  if (btn) btn.classList.add('active')
  if (id === 'train') { renderDaySel(); renderWorkout(S.curDay) }
  if (id === 'prog') renderProg()
  if (id === 'cal') loadMonthLogs().then(renderCalendar)
  if (id === 'cardio') renderWkBars()
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

function renderNutrition() {
  const container = document.getElementById('diet-meals-container')
  const icons = { 'Desayuno': 'ti-coffee', 'Comida': 'ti-soup', 'Merienda': 'ti-apple', 'Cena': 'ti-moon' }

  container.innerHTML = DIET_MEALS.map(meal => {
    const icon = meal.icon || icons[meal.name] || 'ti-salad'
    const foods = meal.diet_foods.map(food => {
      const checked = S.foodsChecked.includes(food.id)
      return `<div class="meal-row row" data-food-id="${food.id}" data-prot="${food.protein_g}" data-kcal="${food.kcal}" onclick="toggleMeal(this)">
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
    suplsEl.innerHTML = SUPPLEMENTS.map(s => {
      const checked = s.protein_g > 0 ? S.foodsChecked.includes(s.id) : false
      return `<div class="meal-row row" data-food-id="${s.id}" data-prot="${s.protein_g}" data-kcal="${s.kcal}" onclick="toggleMeal(this)">
        <button class="check-btn${checked ? ' on' : ''}" aria-label="Marcar">${checked ? '✓' : ''}</button>
        <div style="flex:1;margin-left:10px"><div class="row-name">${s.name}</div></div>
        <span class="tag">${s.dose || ''}</span>
      </div>`
    }).join('')
  }

  updateMealTotals()
  // Restore checked state
  document.querySelectorAll('.meal-row').forEach(row => {
    const id = row.dataset.foodId
    if (id && S.foodsChecked.includes(id)) {
      row.querySelector('.check-btn').classList.add('on')
      row.querySelector('.check-btn').textContent = '✓'
      row.style.opacity = '1'
    }
  })
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
    <div class="pill pill-i" style="margin-bottom:10px"><i class="ti ti-clock"></i> ${wo.duration || '—'}</div>`

  exs.forEach(ex => {
    const done = S.exDone[key].includes(ex.id)
    h += `<div class="row">
      <div style="flex:1">
        <div class="row-name">${ex.name}</div>
        ${ex.note ? `<div class="row-note">${ex.note}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="tag">${ex.sets_reps}</span>
        <button class="check-btn${done ? ' on' : ''}" onclick="toggleEx('${wo.id}','${ex.id}',${dayIdx})">${done ? '✓' : ''}</button>
      </div>
    </div>`
  })

  const isToday = dayIdx === getTodayIdx()
  const alreadyDone = S.calDays[getToday()] === 'done' && isToday
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

window.finishWorkout = async function() {
  const dayIdx = S.curDay
  const today = getToday()
  const todayIdx = getTodayIdx()

  // Solo permitir completar el día actual
  if (dayIdx !== todayIdx) {
    showNotif('Solo puedes completar el entrenamiento de hoy.')
    return
  }

  // Prevenir duplicado
  if (S.calDays[today] === 'done') {
    const sc = S.calScores[today]
    const modalHtml = `
      <div id="finish-modal" onclick="if(event.target===this)this.remove()" style="
        position:fixed;inset:0;background:#000a;display:flex;align-items:center;
        justify-content:center;z-index:1000;padding:20px">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
          padding:28px;max-width:340px;width:100%;text-align:center">
          <div style="font-size:48px;margin-bottom:8px">✅</div>
          <div style="font-size:17px;font-weight:700;margin-bottom:6px">Ya completaste hoy</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:16px">Puntuación del día: <b>${sc?.total ?? '—'}%</b></div>
          <button onclick="document.getElementById('finish-modal').remove()" class="btn btn-primary" style="width:100%">Cerrar</button>
        </div>
      </div>`
    document.body.insertAdjacentHTML('beforeend', modalHtml)
    return
  }

  const wo = WORKOUT_DAYS.find(d => d.day_index === dayIdx)
  const key = `d${dayIdx}`
  const doneEx = S.exDone[key]?.length || 0
  const tot = wo?.workout_exercises?.length || 0

  // Guardar log inmediatamente
  clearTimeout(saveTimeout)
  await saveLog()

  // Calcular puntuación
  const score = calcDayScore()
  S.calDays[today] = 'done'
  S.calScores[today] = score

  const prev = new Date(); prev.setDate(prev.getDate() - 1)
  const pk = prev.toISOString().split('T')[0]
  S.streak = S.calDays[pk] === 'done' ? S.streak + 1 : 1

  await supabase.from('daily_logs').upsert({
    client_id: USER_ID,
    log_date: today,
    calendar_status: 'done',
    score: score.total,
    score_training: score.training,
    score_nutrition: score.nutrition,
    score_cardio: score.cardio,
  }, { onConflict: 'client_id,log_date' })

  // Elegir emoji/título según puntuación
  const emoji = score.total >= 90 ? '🏆' : score.total >= 70 ? '💪' : score.total >= 50 ? '👍' : '📝'
  const title = score.total >= 90 ? '¡Día perfecto!' : score.total >= 70 ? '¡Gran día!' : score.total >= 50 ? 'Buen trabajo' : 'Día registrado'
  const scoreColor = score.total >= 80 ? 'var(--green)' : score.total >= 50 ? 'var(--amber)' : 'var(--red)'

  const modalHtml = `
    <div id="finish-modal" onclick="if(event.target===this)this.remove()" style="
      position:fixed;inset:0;background:#000a;display:flex;align-items:center;
      justify-content:center;z-index:1000;padding:20px">
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);
        padding:28px;max-width:340px;width:100%;text-align:center">
        <div style="font-size:48px;margin-bottom:8px">${emoji}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">${title}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px">
          ${wo?.title || 'Entreno'} · ${doneEx}/${tot} ejercicios · Racha: ${S.streak} 🔥
        </div>
        <div style="background:var(--bg3);border-radius:10px;padding:16px;margin-bottom:16px">
          <div style="font-size:38px;font-weight:800;color:${scoreColor};line-height:1">${score.total}%</div>
          <div style="font-size:11px;color:var(--text2);margin-top:4px">Puntuación del día</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px">
          <div style="background:var(--bg3);border-radius:8px;padding:10px">
            <div style="font-size:16px;font-weight:700;color:var(--green)">${score.training}%</div>
            <div style="font-size:10px;color:var(--text2)">Entreno</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px">
            <div style="font-size:16px;font-weight:700;color:var(--blue)">${score.nutrition}%</div>
            <div style="font-size:10px;color:var(--text2)">Nutrición</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px">
            <div style="font-size:16px;font-weight:700;color:var(--amber)">${score.cardio}%</div>
            <div style="font-size:10px;color:var(--text2)">Cardio</div>
          </div>
        </div>
        <button onclick="document.getElementById('finish-modal').remove()" class="btn btn-primary" style="width:100%">Cerrar</button>
      </div>
    </div>`
  document.body.insertAdjacentHTML('beforeend', modalHtml)
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

window.startSedTimer = function() {
  if (S.sedRunning) {
    clearInterval(S.sedInt); S.sedRunning = false
    document.getElementById('sed-btn').textContent = '▶ Activar'; return
  }
  S.sedRunning = true
  document.getElementById('sed-btn').textContent = '⏸ Pausar'
  S.sedInt = setInterval(() => {
    if (S.sedLeft <= 0) {
      clearInterval(S.sedInt); S.sedRunning = false; S.sedLeft = 2700
      document.getElementById('sed-btn').textContent = '▶ Activar'
      document.getElementById('sed-disp').textContent = '🚶 ¡Levántate!'
      showNotif('¡Han pasado 45 min! Levántate y camina 5 minutos 🚶')
      return
    }
    S.sedLeft--
    document.getElementById('sed-disp').textContent = fmt(S.sedLeft)
  }, 1000)
}

window.resetSedTimer = function() {
  clearInterval(S.sedInt); S.sedRunning = false; S.sedLeft = 2700
  document.getElementById('sed-disp').textContent = '45:00'
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

window.handlePhoto = function(e) {
  const f = e.target.files[0]; if (!f) return
  const r = new FileReader()
  r.onload = ev => {
    const el = document.getElementById(`photo-${S.photoSlot}`)
    el.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
  }
  r.readAsDataURL(f)
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
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: buildSystemPrompt(),
        messages: S.chatHistory
      })
    })
    const data = await res.json()
    const reply = data.content?.find(b => b.type === 'text')?.text || 'Error de conexión.'
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
