import { supabase } from './supabase-client.js'
import { requireRole, logout } from './auth.js'

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const MEAL_ICONS = ['ti-coffee','ti-soup','ti-apple','ti-moon','ti-salad','ti-bread']

let TRAINER_ID = null
let ALL_CLIENTS = []
let SELECTED_CLIENT = null
let SELECTED_CLIENT_DATA = null
let ACTIVE_TAB = 'profile'
let ACTIVE_DAY = 0
let ACTIVE_MEAL_ID = null
let EDITING_EX_ID = null

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireRole('trainer')
  if (!auth) return
  TRAINER_ID = auth.session.user.id
  document.getElementById('trainer-name').textContent = auth.profile.full_name || auth.session.user.email

  await loadClients()
  document.getElementById('loading-screen').style.display = 'none'
  document.getElementById('app').style.display = 'flex'
})

window.doLogout = logout

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

async function loadClients() {
  const { data } = await supabase
    .from('clients')
    .select('id, active, weight_goal, plan_weeks, profiles(full_name, email)')
    .eq('trainer_id', TRAINER_ID)
    .order('active', { ascending: false })
  ALL_CLIENTS = data || []
  renderClientList(ALL_CLIENTS)
}

function renderClientList(clients) {
  const el = document.getElementById('client-list')
  if (!clients.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px">Sin clientes todavía</div>'
    return
  }
  el.innerHTML = clients.map(c => {
    const name = c.profiles?.full_name || c.profiles?.email || '—'
    const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    const selected = SELECTED_CLIENT === c.id
    return `<div class="client-card${selected ? ' selected' : ''}" onclick="selectClient('${c.id}')">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="client-avatar">${initials}</div>
        <div>
          <div style="font-size:13px;font-weight:600">${name}</div>
          <div style="font-size:11px;color:var(--text2)">${c.profiles?.email || ''}</div>
        </div>
        <div style="margin-left:auto">
          <span class="badge ${c.active ? 'badge-green' : 'badge-gray'}">${c.active ? 'Activo' : 'Inactivo'}</span>
        </div>
      </div>
    </div>`
  }).join('')
}

window.filterClients = function(q) {
  const lq = q.toLowerCase()
  renderClientList(ALL_CLIENTS.filter(c =>
    (c.profiles?.full_name || '').toLowerCase().includes(lq) ||
    (c.profiles?.email || '').toLowerCase().includes(lq)
  ))
}

window.selectClient = async function(clientId) {
  SELECTED_CLIENT = clientId
  renderClientList(ALL_CLIENTS.filter(() => true)) // re-render to update selected
  await loadClientDetail(clientId)
}

async function loadClientDetail(clientId) {
  const main = document.getElementById('main-content')
  main.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando...</div>'

  const [{ data: client }, { data: woData }, { data: dietData }, { data: supls }] = await Promise.all([
    supabase.from('clients').select('*, profiles(full_name, email)').eq('id', clientId).single(),
    supabase.from('workout_days').select('*, workout_exercises(*)').eq('client_id', clientId).order('day_index'),
    supabase.from('diet_plans').select('*, diet_meals(*, diet_foods(*))').eq('client_id', clientId).eq('active', true).single(),
    supabase.from('supplements').select('*').eq('client_id', clientId).order('order_index'),
  ])

  SELECTED_CLIENT_DATA = { client, workouts: woData || [], diet: dietData, supplements: supls || [] }
  if (dietData?.diet_meals) {
    dietData.diet_meals.sort((a, b) => a.order_index - b.order_index)
    dietData.diet_meals.forEach(m => m.diet_foods.sort((a, b) => a.order_index - b.order_index))
  }

  renderClientDetail()
}

function renderClientDetail() {
  const { client } = SELECTED_CLIENT_DATA
  const name = client.profiles?.full_name || client.profiles?.email || '—'

  document.getElementById('main-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div class="client-avatar" style="width:48px;height:48px;font-size:20px">${name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()}</div>
      <div>
        <div style="font-size:18px;font-weight:600">${name}</div>
        <div style="font-size:12px;color:var(--text2)">${client.profiles?.email || ''}</div>
      </div>
      <label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">
        <input type="checkbox" ${client.active ? 'checked' : ''} onchange="toggleClientActive(this.checked)"> Activo
      </label>
    </div>

    <div class="tabs">
      <button class="tab-btn${ACTIVE_TAB==='profile'?' active':''}" onclick="switchTab('profile')"><i class="ti ti-user"></i> Perfil</button>
      <button class="tab-btn${ACTIVE_TAB==='workout'?' active':''}" onclick="switchTab('workout')"><i class="ti ti-barbell"></i> Entreno</button>
      <button class="tab-btn${ACTIVE_TAB==='diet'?' active':''}" onclick="switchTab('diet')"><i class="ti ti-apple"></i> Dieta</button>
      <button class="tab-btn${ACTIVE_TAB==='supplements'?' active':''}" onclick="switchTab('supplements')"><i class="ti ti-pill"></i> Supls</button>
      <button class="tab-btn${ACTIVE_TAB==='progress'?' active':''}" onclick="switchTab('progress')"><i class="ti ti-chart-line"></i> Progreso</button>
    </div>

    <div id="tab-content"></div>
  `
  renderTab()
}

window.switchTab = function(tab) {
  ACTIVE_TAB = tab
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.toLowerCase().includes(tab === 'profile' ? 'perfil' : tab === 'workout' ? 'entreno' : tab === 'diet' ? 'dieta' : tab === 'supplements' ? 'supls' : 'progreso'))
  })
  renderTab()
}

function renderTab() {
  const el = document.getElementById('tab-content')
  if (!el) return
  if (ACTIVE_TAB === 'profile') renderProfileTab(el)
  else if (ACTIVE_TAB === 'workout') renderWorkoutTab(el)
  else if (ACTIVE_TAB === 'diet') renderDietTab(el)
  else if (ACTIVE_TAB === 'supplements') renderSupplementsTab(el)
  else if (ACTIVE_TAB === 'progress') renderProgressTab(el)
}

// ─── TAB: PERFIL ──────────────────────────────────────────────────────────────

function renderProfileTab(el) {
  const c = SELECTED_CLIENT_DATA.client
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-info-circle"></i> Datos básicos</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">Nombre</label><input type="text" id="p-name" value="${c.profiles?.full_name || ''}"></div>
        <div class="form-group"><label class="form-label">Edad</label><input type="number" id="p-age" value="${c.age || ''}" placeholder="40"></div>
        <div class="form-group"><label class="form-label">Altura (cm)</label><input type="number" id="p-height" value="${c.height_cm || ''}" placeholder="175"></div>
        <div class="form-group"><label class="form-label">Peso inicial (kg)</label><input type="number" id="p-weight" value="${c.weight_start || ''}" placeholder="80" step="0.1"></div>
        <div class="form-group"><label class="form-label">Peso objetivo</label><input type="text" id="p-weight-goal" value="${c.weight_goal || ''}" placeholder="72-75 kg"></div>
        <div class="form-group"><label class="form-label">Semanas plan</label><input type="number" id="p-weeks" value="${c.plan_weeks || 12}" min="4" max="52"></div>
        <div class="form-group"><label class="form-label">Kcal objetivo</label><input type="number" id="p-kcal" value="${c.kcal_goal || 2500}"></div>
        <div class="form-group"><label class="form-label">Proteína objetivo (g)</label><input type="number" id="p-protein" value="${c.protein_goal || 175}"></div>
        <div class="form-group"><label class="form-label">Pasos objetivo</label><input type="number" id="p-steps" value="${c.steps_goal || 9000}"></div>
        <div class="form-group"><label class="form-label">Fase</label><input type="text" id="p-phase" value="${c.phase_name || 'Fase 1'}"></div>
      </div>
      <div class="form-group"><label class="form-label">Inicio del plan</label><input type="date" id="p-start" value="${c.plan_start_date || ''}"></div>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-notes"></i> Notas médicas y restricciones</div>
      <textarea id="p-notes" style="min-height:100px">${c.notes || ''}</textarea>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-flame" style="color:var(--amber)"></i> Reglas de oro</div>
      <div id="rules-list">${renderRulesList(c.golden_rules || [])}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="text" id="new-rule" placeholder="Nueva regla de oro..." style="flex:1">
        <button class="btn" onclick="addRule()"><i class="ti ti-plus"></i></button>
      </div>
    </div>
    <button class="btn btn-primary" onclick="saveProfile()" style="width:100%">Guardar perfil</button>
  `
}

function renderRulesList(rules) {
  return rules.map((r, i) =>
    `<div class="row">
      <span style="flex:1;font-size:13px">${r}</span>
      <button class="check-btn" onclick="removeRule(${i})" style="font-size:12px">×</button>
    </div>`
  ).join('')
}

window.addRule = function() {
  const inp = document.getElementById('new-rule')
  const txt = inp.value.trim()
  if (!txt) return
  const rules = SELECTED_CLIENT_DATA.client.golden_rules || []
  rules.push(txt)
  SELECTED_CLIENT_DATA.client.golden_rules = rules
  document.getElementById('rules-list').innerHTML = renderRulesList(rules)
  inp.value = ''
}

window.removeRule = function(i) {
  const rules = SELECTED_CLIENT_DATA.client.golden_rules || []
  rules.splice(i, 1)
  document.getElementById('rules-list').innerHTML = renderRulesList(rules)
}

window.saveProfile = async function() {
  const c = SELECTED_CLIENT_DATA.client
  const profileUpdate = {
    age: parseInt(document.getElementById('p-age').value) || null,
    height_cm: parseFloat(document.getElementById('p-height').value) || null,
    weight_start: parseFloat(document.getElementById('p-weight').value) || null,
    weight_goal: document.getElementById('p-weight-goal').value,
    kcal_goal: parseInt(document.getElementById('p-kcal').value) || 2500,
    protein_goal: parseInt(document.getElementById('p-protein').value) || 175,
    steps_goal: parseInt(document.getElementById('p-steps').value) || 9000,
    plan_weeks: parseInt(document.getElementById('p-weeks').value) || 12,
    plan_start_date: document.getElementById('p-start').value || null,
    phase_name: document.getElementById('p-phase').value,
    notes: document.getElementById('p-notes').value,
    golden_rules: c.golden_rules || [],
  }

  const { error } = await supabase.from('clients').update(profileUpdate).eq('id', SELECTED_CLIENT)
  if (!error) {
    Object.assign(SELECTED_CLIENT_DATA.client, profileUpdate)
    showNotif('Perfil guardado ✓')
  } else {
    showNotif('Error al guardar: ' + error.message)
  }
}

window.toggleClientActive = async function(active) {
  await supabase.from('clients').update({ active }).eq('id', SELECTED_CLIENT)
  SELECTED_CLIENT_DATA.client.active = active
  const idx = ALL_CLIENTS.findIndex(c => c.id === SELECTED_CLIENT)
  if (idx >= 0) ALL_CLIENTS[idx].active = active
  renderClientList(ALL_CLIENTS)
}

// ─── TAB: ENTRENO ─────────────────────────────────────────────────────────────

function renderWorkoutTab(el) {
  const { workouts } = SELECTED_CLIENT_DATA
  el.innerHTML = `
    <div class="day-sel" id="wo-day-sel"></div>
    <div id="wo-day-content"></div>
  `
  renderWoDaySel()
  renderWoDay()
}

function renderWoDaySel() {
  const sel = document.getElementById('wo-day-sel')
  if (!sel) return
  sel.innerHTML = DAYS.map((d, i) =>
    `<button class="${i === ACTIVE_DAY ? 'active' : ''}" onclick="selectWoDay(${i})">${d}</button>`
  ).join('')
}

window.selectWoDay = function(i) {
  ACTIVE_DAY = i
  renderWoDaySel()
  renderWoDay()
}

function renderWoDay() {
  const el = document.getElementById('wo-day-content')
  if (!el) return
  const { workouts } = SELECTED_CLIENT_DATA
  const day = workouts.find(d => d.day_index === ACTIVE_DAY)

  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-calendar"></i> ${DAYS[ACTIVE_DAY]}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Nombre del día</label>
          <input type="text" id="wo-title" value="${day?.title || ''}" placeholder="Ej: Torso Fuerza">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Duración</label>
          <input type="text" id="wo-dur" value="${day?.duration || ''}" placeholder="60-70 min">
        </div>
      </div>
      <div id="wo-ex-list">
        ${day ? renderExList(day.workout_exercises) : '<div style="font-size:12px;color:var(--text3)">Sin ejercicios todavía</div>'}
      </div>
      <div class="btn-group" style="margin-top:12px">
        <button class="btn" onclick="openAddEx()" style="flex:1"><i class="ti ti-plus"></i> Ejercicio</button>
        <button class="btn btn-primary" onclick="saveWorkoutDay()" style="flex:1"><i class="ti ti-device-floppy"></i> Guardar día</button>
      </div>
    </div>
  `
}

function renderExList(exercises) {
  if (!exercises?.length) return '<div style="font-size:12px;color:var(--text3);padding:8px 0">Sin ejercicios</div>'
  return exercises.sort((a, b) => a.order_index - b.order_index).map((ex, i) =>
    `<div class="row" id="ex-row-${ex.id}">
      <div style="flex:1">
        <div class="row-name">${ex.name}</div>
        ${ex.note ? `<div class="row-note">${ex.note}</div>` : ''}
      </div>
      <span class="tag" style="margin-right:8px">${ex.sets_reps}</span>
      <button class="check-btn" onclick="deleteExercise('${ex.id}')" title="Eliminar" style="font-size:12px">×</button>
    </div>`
  ).join('')
}

window.saveWorkoutDay = async function() {
  const title = document.getElementById('wo-title').value.trim()
  const duration = document.getElementById('wo-dur').value.trim()
  if (!title) { showNotif('Introduce el nombre del día'); return }

  const { data: day, error } = await supabase
    .from('workout_days')
    .upsert({ client_id: SELECTED_CLIENT, day_index: ACTIVE_DAY, title, duration }, { onConflict: 'client_id,day_index' })
    .select()
    .single()

  if (!error) {
    const idx = SELECTED_CLIENT_DATA.workouts.findIndex(d => d.day_index === ACTIVE_DAY)
    if (idx >= 0) {
      SELECTED_CLIENT_DATA.workouts[idx].title = title
      SELECTED_CLIENT_DATA.workouts[idx].duration = duration
    } else {
      SELECTED_CLIENT_DATA.workouts.push({ ...day, workout_exercises: [] })
    }
    showNotif('Día guardado ✓')
  }
}

// EXERCISE MODAL
let currentWoDayId = null

window.openAddEx = async function() {
  // Get or create the workout day first
  const { workouts } = SELECTED_CLIENT_DATA
  let day = workouts.find(d => d.day_index === ACTIVE_DAY)

  if (!day) {
    const title = document.getElementById('wo-title')?.value || DAYS[ACTIVE_DAY]
    const { data: newDay } = await supabase
      .from('workout_days')
      .upsert({ client_id: SELECTED_CLIENT, day_index: ACTIVE_DAY, title }, { onConflict: 'client_id,day_index' })
      .select()
      .single()
    if (!newDay) { showNotif('Guarda el día primero'); return }
    day = { ...newDay, workout_exercises: [] }
    SELECTED_CLIENT_DATA.workouts.push(day)
  }

  currentWoDayId = day.id
  document.getElementById('ex-name').value = ''
  document.getElementById('ex-sets').value = ''
  document.getElementById('ex-note').value = ''
  EDITING_EX_ID = null
  document.getElementById('ex-modal-title').textContent = 'Añadir ejercicio'
  document.getElementById('ex-modal').classList.add('open')
}

window.closeExModal = function() {
  document.getElementById('ex-modal').classList.remove('open')
}

window.saveExercise = async function() {
  const name = document.getElementById('ex-name').value.trim()
  const sets_reps = document.getElementById('ex-sets').value.trim()
  const note = document.getElementById('ex-note').value.trim()
  if (!name || !sets_reps) { showNotif('Nombre y series son obligatorios'); return }

  const day = SELECTED_CLIENT_DATA.workouts.find(d => d.day_index === ACTIVE_DAY)
  const order_index = day?.workout_exercises?.length || 0

  const { data: ex, error } = await supabase
    .from('workout_exercises')
    .insert({ workout_day_id: currentWoDayId, name, sets_reps, note: note || null, order_index })
    .select()
    .single()

  if (!error && day) {
    day.workout_exercises.push(ex)
    document.getElementById('wo-ex-list').innerHTML = renderExList(day.workout_exercises)
    closeExModal()
    showNotif('Ejercicio añadido ✓')
  }
}

window.deleteExercise = async function(exId) {
  await supabase.from('workout_exercises').delete().eq('id', exId)
  const day = SELECTED_CLIENT_DATA.workouts.find(d => d.day_index === ACTIVE_DAY)
  if (day) {
    day.workout_exercises = day.workout_exercises.filter(e => e.id !== exId)
    document.getElementById('wo-ex-list').innerHTML = renderExList(day.workout_exercises)
  }
}

// ─── TAB: DIETA ───────────────────────────────────────────────────────────────

function renderDietTab(el) {
  const { diet } = SELECTED_CLIENT_DATA
  const meals = diet?.diet_meals || []

  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-apple"></i> Plan de dieta</div>
      ${meals.length === 0
        ? '<div style="font-size:12px;color:var(--text3);margin-bottom:12px">Sin comidas asignadas. Crea la primera.</div>'
        : meals.map(m => renderMealCard(m)).join('')
      }
      <button class="btn" onclick="addMeal()" style="width:100%;margin-top:8px"><i class="ti ti-plus"></i> Añadir comida</button>
    </div>

    ${!diet ? `<div class="card" style="text-align:center">
      <div style="color:var(--text2);font-size:13px;margin-bottom:12px">Sin plan de dieta activo</div>
      <button class="btn btn-primary" onclick="createDietPlan()">Crear plan de dieta</button>
    </div>` : ''}
  `
}

function renderMealCard(meal) {
  return `
    <div class="card" style="margin-bottom:8px;background:var(--bg3)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="display:flex;gap:6px">
          ${MEAL_ICONS.map(ic => `<button onclick="changeMealIcon('${meal.id}','${ic}')" style="background:${meal.icon===ic?'var(--blue)':'var(--bg2)'};border:1px solid var(--border2);border-radius:6px;padding:4px 6px;cursor:pointer;color:var(--text)">
            <i class="ti ${ic}" style="font-size:14px"></i>
          </button>`).join('')}
        </div>
        <input type="text" value="${meal.name}" id="meal-name-${meal.id}"
          style="flex:1;background:transparent;border:none;border-bottom:1px solid var(--border2);border-radius:0;padding:4px 0;font-size:14px;font-weight:600"
          onchange="renameMeal('${meal.id}',this.value)">
        <button class="check-btn" onclick="deleteMeal('${meal.id}')" title="Eliminar comida" style="font-size:12px">×</button>
      </div>
      <div id="foods-in-${meal.id}">
        ${meal.diet_foods.map(f => renderFoodRow(f, meal.id)).join('') || '<div style="font-size:11px;color:var(--text3)">Sin alimentos</div>'}
      </div>
      <button class="btn" onclick="openAddFood('${meal.id}')" style="margin-top:8px;font-size:12px;padding:6px 12px"><i class="ti ti-plus"></i> Alimento</button>
    </div>
  `
}

function renderFoodRow(food, mealId) {
  return `<div class="row" id="food-row-${food.id}">
    <div style="flex:1"><div class="row-name" style="font-size:13px">${food.name}</div></div>
    ${food.protein_g ? `<span class="tag" style="margin-right:4px">${food.protein_g}g prot</span>` : ''}
    ${food.kcal ? `<span class="tag" style="margin-right:6px">${food.kcal}kcal</span>` : ''}
    <button class="check-btn" onclick="deleteFood('${food.id}','${mealId}')" style="font-size:12px">×</button>
  </div>`
}

window.createDietPlan = async function() {
  const { data } = await supabase
    .from('diet_plans')
    .insert({ client_id: SELECTED_CLIENT, name: 'Plan principal', active: true })
    .select('*, diet_meals(*, diet_foods(*))')
    .single()
  SELECTED_CLIENT_DATA.diet = data
  renderTab()
}

window.addMeal = async function() {
  if (!SELECTED_CLIENT_DATA.diet) { await createDietPlan(); return }
  const mealNames = ['Desayuno','Comida','Merienda','Cena','Pre-entreno','Post-entreno']
  const existing = SELECTED_CLIENT_DATA.diet.diet_meals?.length || 0
  const name = mealNames[existing] || 'Comida extra'
  const icon = MEAL_ICONS[existing % MEAL_ICONS.length]

  const { data: meal } = await supabase
    .from('diet_meals')
    .insert({ diet_plan_id: SELECTED_CLIENT_DATA.diet.id, name, icon, order_index: existing })
    .select('*, diet_foods(*)')
    .single()

  SELECTED_CLIENT_DATA.diet.diet_meals = SELECTED_CLIENT_DATA.diet.diet_meals || []
  SELECTED_CLIENT_DATA.diet.diet_meals.push({ ...meal, diet_foods: [] })
  renderTab()
}

window.renameMeal = async function(mealId, name) {
  await supabase.from('diet_meals').update({ name }).eq('id', mealId)
}

window.changeMealIcon = async function(mealId, icon) {
  await supabase.from('diet_meals').update({ icon }).eq('id', mealId)
  const meal = SELECTED_CLIENT_DATA.diet?.diet_meals?.find(m => m.id === mealId)
  if (meal) { meal.icon = icon; renderTab() }
}

window.deleteMeal = async function(mealId) {
  await supabase.from('diet_meals').delete().eq('id', mealId)
  if (SELECTED_CLIENT_DATA.diet?.diet_meals) {
    SELECTED_CLIENT_DATA.diet.diet_meals = SELECTED_CLIENT_DATA.diet.diet_meals.filter(m => m.id !== mealId)
    renderTab()
  }
}

// Food modal
window.openAddFood = function(mealId) {
  ACTIVE_MEAL_ID = mealId
  document.getElementById('fd-name').value = ''
  document.getElementById('fd-prot').value = ''
  document.getElementById('fd-kcal').value = ''
  document.getElementById('food-modal').classList.add('open')
}

window.closeFoodModal = function() {
  document.getElementById('food-modal').classList.remove('open')
}

window.saveFood = async function() {
  const name = document.getElementById('fd-name').value.trim()
  const protein_g = parseInt(document.getElementById('fd-prot').value) || 0
  const kcal = parseInt(document.getElementById('fd-kcal').value) || 0
  if (!name) { showNotif('El nombre es obligatorio'); return }

  const meal = SELECTED_CLIENT_DATA.diet?.diet_meals?.find(m => m.id === ACTIVE_MEAL_ID)
  const order_index = meal?.diet_foods?.length || 0

  const { data: food } = await supabase
    .from('diet_foods')
    .insert({ diet_meal_id: ACTIVE_MEAL_ID, name, protein_g, kcal, order_index })
    .select()
    .single()

  if (meal) {
    meal.diet_foods.push(food)
    const foodsEl = document.getElementById(`foods-in-${ACTIVE_MEAL_ID}`)
    if (foodsEl) foodsEl.innerHTML = meal.diet_foods.map(f => renderFoodRow(f, ACTIVE_MEAL_ID)).join('')
    closeFoodModal()
    showNotif('Alimento añadido ✓')
  }
}

window.deleteFood = async function(foodId, mealId) {
  await supabase.from('diet_foods').delete().eq('id', foodId)
  const meal = SELECTED_CLIENT_DATA.diet?.diet_meals?.find(m => m.id === mealId)
  if (meal) {
    meal.diet_foods = meal.diet_foods.filter(f => f.id !== foodId)
    const foodsEl = document.getElementById(`foods-in-${mealId}`)
    if (foodsEl) foodsEl.innerHTML = meal.diet_foods.map(f => renderFoodRow(f, mealId)).join('')
  }
}

// ─── TAB: SUPLEMENTOS ─────────────────────────────────────────────────────────

function renderSupplementsTab(el) {
  const { supplements } = SELECTED_CLIENT_DATA
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-pill"></i> Suplementación</div>
      <div id="supls-admin-list">
        ${supplements.map((s, i) => renderSuplRow(s, i)).join('') || '<div style="font-size:12px;color:var(--text3)">Sin suplementos asignados</div>'}
      </div>
      <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:8px">
          <input type="text" id="s-name" placeholder="Nombre (ej: Creatina)">
          <input type="text" id="s-dose" placeholder="Dosis">
          <button class="btn btn-primary" onclick="addSupplement()"><i class="ti ti-plus"></i></button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input type="number" id="s-prot" placeholder="Proteína (g)" min="0">
          <input type="number" id="s-kcal" placeholder="Kcal" min="0">
        </div>
      </div>
    </div>
  `
}

function renderSuplRow(s, i) {
  return `<div class="row">
    <div style="flex:1"><div class="row-name">${s.name}</div>${s.dose ? `<div class="row-note">${s.dose}</div>` : ''}</div>
    ${s.protein_g ? `<span class="tag" style="margin-right:4px">${s.protein_g}g</span>` : ''}
    <button class="check-btn" onclick="deleteSupplement('${s.id}')" style="font-size:12px">×</button>
  </div>`
}

window.addSupplement = async function() {
  const name = document.getElementById('s-name').value.trim()
  const dose = document.getElementById('s-dose').value.trim()
  const protein_g = parseInt(document.getElementById('s-prot').value) || 0
  const kcal = parseInt(document.getElementById('s-kcal').value) || 0
  if (!name) return

  const order_index = SELECTED_CLIENT_DATA.supplements.length
  const { data: s } = await supabase
    .from('supplements')
    .insert({ client_id: SELECTED_CLIENT, name, dose, protein_g, kcal, order_index })
    .select().single()

  SELECTED_CLIENT_DATA.supplements.push(s)
  document.getElementById('supls-admin-list').innerHTML =
    SELECTED_CLIENT_DATA.supplements.map((s, i) => renderSuplRow(s, i)).join('')
  document.getElementById('s-name').value = ''
  document.getElementById('s-dose').value = ''
  document.getElementById('s-prot').value = ''
  document.getElementById('s-kcal').value = ''
  showNotif('Suplemento añadido ✓')
}

window.deleteSupplement = async function(id) {
  await supabase.from('supplements').delete().eq('id', id)
  SELECTED_CLIENT_DATA.supplements = SELECTED_CLIENT_DATA.supplements.filter(s => s.id !== id)
  document.getElementById('supls-admin-list').innerHTML =
    SELECTED_CLIENT_DATA.supplements.map((s, i) => renderSuplRow(s, i)).join('')
}

// ─── TAB: PROGRESO ────────────────────────────────────────────────────────────

async function renderProgressTab(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando...</div>'

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('log_date, weight_kg, steps, cardio_min, calendar_status')
    .eq('client_id', SELECTED_CLIENT)
    .gte('log_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('log_date', { ascending: true })

  const allLogs = logs || []
  const done = allLogs.filter(l => l.calendar_status === 'done').length
  const total = allLogs.length
  const adherence = total > 0 ? Math.round(done / total * 100) : 0
  const latestWeight = allLogs.filter(l => l.weight_kg).slice(-1)[0]
  const pesos = allLogs.filter(l => l.weight_kg)

  el.innerHTML = `
    <div class="metric-grid">
      <div class="metric"><div class="metric-label">Adherencia 30d</div><div class="metric-val">${adherence}%</div><div class="metric-sub">${done}/${total} días</div></div>
      <div class="metric"><div class="metric-label">Peso actual</div><div class="metric-val">${latestWeight ? latestWeight.weight_kg + ' kg' : '—'}</div><div class="metric-sub">último registro</div></div>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-chart-line"></i> Evolución de peso (30 días)</div>
      <div style="position:relative;height:160px">
        <canvas id="trainer-peso-chart"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-calendar"></i> Últimos registros</div>
      ${allLogs.slice(-10).reverse().map(l =>
        `<div class="row">
          <span style="font-size:12px;color:var(--text2)">${l.log_date}</span>
          <div style="display:flex;gap:8px;align-items:center">
            ${l.weight_kg ? `<span class="tag">${l.weight_kg} kg</span>` : ''}
            ${l.steps ? `<span class="tag">${l.steps.toLocaleString('es-ES')} pasos</span>` : ''}
            ${l.cardio_min ? `<span class="tag">${l.cardio_min} min</span>` : ''}
            <span class="badge ${l.calendar_status === 'done' ? 'badge-green' : l.calendar_status === 'miss' ? 'badge-red' : 'badge-gray'}">${l.calendar_status || '—'}</span>
          </div>
        </div>`
      ).join('') || '<div style="font-size:12px;color:var(--text3)">Sin registros</div>'}
    </div>
  `

  if (pesos.length >= 2) {
    // @ts-ignore
    new Chart(document.getElementById('trainer-peso-chart'), {
      type: 'line',
      data: {
        labels: pesos.map(l => l.log_date.slice(5)),
        datasets: [{ label: 'Peso', data: pesos.map(l => l.weight_kg), borderColor: '#378ADD', backgroundColor: '#378ADD22', tension: .35, pointRadius: 4, fill: true }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: Math.min(...pesos.map(l=>l.weight_kg))-2, max: Math.max(...pesos.map(l=>l.weight_kg))+2, ticks: { color: '#a0a0a0' }, grid: { color: '#2a2a2a' } },
          x: { ticks: { color: '#a0a0a0' }, grid: { color: '#2a2a2a' } }
        }
      }
    })
  }
}

// ─── NUEVO CLIENTE MODAL ──────────────────────────────────────────────────────

window.openNewClientModal = function() {
  document.getElementById('new-client-modal').classList.add('open')
}

window.closeNewClientModal = function() {
  document.getElementById('new-client-modal').classList.remove('open')
}

window.createClient = async function() {
  const name = document.getElementById('nc-name').value.trim()
  const email = document.getElementById('nc-email').value.trim()
  const password = document.getElementById('nc-password').value
  const errEl = document.getElementById('nc-error')
  const btn = document.getElementById('nc-btn')

  if (!name || !email || !password) { errEl.textContent = 'Nombre, email y contraseña son obligatorios'; errEl.style.display = 'block'; return }
  if (password.length < 8) { errEl.textContent = 'La contraseña debe tener al menos 8 caracteres'; errEl.style.display = 'block'; return }

  btn.textContent = 'Creando...'
  btn.disabled = true
  errEl.style.display = 'none'

  const clientData = {
    age: parseInt(document.getElementById('nc-age').value) || null,
    height_cm: parseFloat(document.getElementById('nc-height').value) || null,
    weight_start: parseFloat(document.getElementById('nc-weight').value) || null,
    weight_goal: document.getElementById('nc-weight-goal').value,
    kcal_goal: parseInt(document.getElementById('nc-kcal').value) || 2500,
    protein_goal: parseInt(document.getElementById('nc-protein').value) || 175,
    notes: document.getElementById('nc-notes').value,
    plan_weeks: parseInt(document.getElementById('nc-weeks').value) || 12,
    plan_start_date: new Date().toISOString().split('T')[0],
  }

  // Guardar sesión del trainer antes de signUp (signUp cambia la sesión activa)
  const { data: { session: trainerSession } } = await supabase.auth.getSession()

  // Crear usuario con signUp
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role: 'client', full_name: name } }
  })

  if (signUpError) {
    errEl.textContent = signUpError.message
    errEl.style.display = 'block'
    btn.textContent = 'Crear cliente'
    btn.disabled = false
    return
  }

  // Restaurar sesión del trainer inmediatamente
  await supabase.auth.setSession({
    access_token: trainerSession.access_token,
    refresh_token: trainerSession.refresh_token
  })

  if (!data.user) {
    errEl.textContent = 'No se pudo crear el usuario'
    errEl.style.display = 'block'
    btn.textContent = 'Crear cliente'
    btn.disabled = false
    return
  }

  // Confirmar email del nuevo usuario via SQL (requiere que el trainer tenga permisos)
  // y crear entradas en profiles + clients
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id, role: 'client', full_name: name, email
  })

  const { error: clientError } = await supabase.from('clients').upsert({
    id: data.user.id,
    trainer_id: TRAINER_ID,
    ...clientData
  })

  if (clientError) {
    errEl.textContent = 'Usuario creado pero error al guardar perfil: ' + clientError.message + '. El admin puede vincularlo manualmente.'
    errEl.style.display = 'block'
    btn.textContent = 'Crear cliente'
    btn.disabled = false
    return
  }

  closeNewClientModal()
  await loadClients()
  showNotif('Cliente creado correctamente ✓')
  btn.textContent = 'Crear cliente'
  btn.disabled = false
}

function getSupabaseUrl() {
  // Obtener la URL base de Supabase desde el cliente ya inicializado
  const url = document.querySelector('script[src*="supabase"]')?.src || ''
  // Fallback: leer del supabase-client.js — el trainer-app importa supabase que ya tiene la URL
  return supabase.supabaseUrl || ''
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function showNotif(msg) {
  // Mostrar como toast sin element de notif en trainer (usar alert temporal)
  const n = document.createElement('div')
  n.style.cssText = 'position:fixed;top:16px;right:16px;background:var(--blue);color:#fff;border-radius:12px;padding:12px 16px;font-size:13px;z-index:400;animation:fadeIn .3s'
  n.textContent = msg
  document.body.appendChild(n)
  setTimeout(() => n.remove(), 3500)
}

window.showNotif = showNotif
