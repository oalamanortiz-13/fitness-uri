import { supabase } from './supabase-client.js'
import { requireRole, logout } from './auth.js'

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const MEAL_ICONS = ['ti-coffee','ti-soup','ti-apple','ti-moon','ti-salad','ti-bread']

const CARDIO_TYPES = [
  { id: 'correr',       label: 'Correr',           icon: 'ti-run'             },
  { id: 'caminar',      label: 'Caminar rápido',   icon: 'ti-walk'            },
  { id: 'cinta',        label: 'Cinta',             icon: 'ti-treadmill'       },
  { id: 'eliptica',     label: 'Elíptica',          icon: 'ti-arrows-right-left'},
  { id: 'bici',         label: 'Bici estática',     icon: 'ti-bike'            },
  { id: 'spinning',     label: 'Spinning',          icon: 'ti-brand-cycling'   },
  { id: 'remo',         label: 'Remo',              icon: 'ti-ripple'          },
  { id: 'natacion',     label: 'Natación',          icon: 'ti-swim'            },
  { id: 'escaladora',   label: 'Escaladora',        icon: 'ti-stairs-up'       },
  { id: 'comba',        label: 'Comba',             icon: 'ti-circles-relation'},
  { id: 'hiit',         label: 'HIIT',              icon: 'ti-flame'           },
  { id: 'boxing',       label: 'Boxeo / saco',      icon: 'ti-ball-american-football'},
  { id: 'step',         label: 'Step aeróbic',      icon: 'ti-steps'           },
  { id: 'senderismo',   label: 'Senderismo',        icon: 'ti-mountain'        },
]

let TRAINER_ID = null
let ALL_CLIENTS = []
let SELECTED_CLIENT = null
let SELECTED_CLIENT_DATA = null
let ACTIVE_TAB = 'profile'
let ACTIVE_DAY = 0
let ACTIVE_MEAL_ID = null
let EDITING_EX_ID = null
let SUBSCRIPTION_STATUS = 'trial'

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireRole('trainer')
  if (!auth) return
  TRAINER_ID = auth.session.user.id
  const trainerName = auth.profile.full_name || auth.session.user.email
  document.getElementById('trainer-name-logo').textContent = trainerName

  await loadSubscriptionStatus()
  await loadTrainerLogo()
  await loadClients()
  document.getElementById('loading-screen').style.display = 'none'
  document.getElementById('app').style.display = 'flex'

  // Mostrar banner si viene de pago exitoso
  const params = new URLSearchParams(window.location.search)
  if (params.get('payment') === 'success') {
    showNotif('¡Suscripción activada correctamente! ✓')
    history.replaceState({}, '', 'trainer.html')
  }
})

window.doLogout = logout

// ─── SUSCRIPCIÓN ──────────────────────────────────────────────────────────────

async function loadSubscriptionStatus() {
  const { data } = await supabase
    .from('trainers')
    .select('subscription_status, trial_ends_at')
    .eq('id', TRAINER_ID)
    .single()

  if (!data) return

  SUBSCRIPTION_STATUS = data.subscription_status || 'trial'
  const trialEnds = data.trial_ends_at ? new Date(data.trial_ends_at) : null
  const now = new Date()
  const trialExpired = trialEnds && trialEnds < now

  if (SUBSCRIPTION_STATUS === 'trial' && !trialExpired) {
    const daysLeft = trialEnds ? Math.ceil((trialEnds - now) / 86400000) : 14
    showSubscriptionBanner('trial', daysLeft)
  } else if (SUBSCRIPTION_STATUS === 'past_due') {
    showSubscriptionBanner('past_due')
  } else if (SUBSCRIPTION_STATUS === 'canceled' || (SUBSCRIPTION_STATUS === 'trial' && trialExpired)) {
    showSubscriptionBanner('expired')
    SUBSCRIPTION_STATUS = 'expired'
  }
}

function showSubscriptionBanner(type, daysLeft = 0) {
  const sidebar = document.querySelector('.sidebar')
  const existing = document.getElementById('sub-banner')
  if (existing) existing.remove()

  const banner = document.createElement('div')
  banner.id = 'sub-banner'

  if (type === 'trial') {
    banner.style.cssText = 'background:#1D9E7522;border:1px solid #1D9E7544;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px'
    banner.innerHTML = `<div style="color:#6fcfa8;font-weight:600;margin-bottom:4px">Prueba gratuita · ${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}</div>
      <div style="color:var(--text2);margin-bottom:8px">€9,90/cliente/mes al finalizar</div>
      <button onclick="startCheckout()" class="btn btn-primary" style="width:100%;font-size:12px;padding:7px">Activar suscripción</button>`
  } else if (type === 'past_due') {
    banner.style.cssText = 'background:#BA751722;border:1px solid #BA751744;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px'
    banner.innerHTML = `<div style="color:#e8a83e;font-weight:600;margin-bottom:4px">Pago fallido</div>
      <div style="color:var(--text2);margin-bottom:8px">Actualiza tu método de pago para continuar</div>
      <button onclick="startCheckout()" class="btn" style="width:100%;font-size:12px;padding:7px;border-color:#BA7517;color:#e8a83e">Actualizar pago</button>`
  } else {
    banner.style.cssText = 'background:#E24B4A22;border:1px solid #E24B4A44;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px'
    banner.innerHTML = `<div style="color:#F09595;font-weight:600;margin-bottom:4px">Suscripción inactiva</div>
      <div style="color:var(--text2);margin-bottom:8px">Activa tu plan para gestionar clientes</div>
      <button onclick="startCheckout()" class="btn btn-primary" style="width:100%;font-size:12px;padding:7px">Activar plan · €9,90/cliente</button>`
  }

  sidebar.insertBefore(banner, sidebar.querySelector('.search-input'))
}

window.startCheckout = async function() {
  const btn = document.querySelector('#sub-banner button')
  if (btn) { btn.textContent = 'Redirigiendo...'; btn.disabled = true }

  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${supabase.supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      successUrl: `${window.location.origin}/trainer.html?payment=success`,
      cancelUrl: `${window.location.origin}/trainer.html`,
    }),
  })

  const { url, error } = await res.json()
  if (error) { showNotif('Error: ' + error); return }
  window.location.href = url
}


// ─── LOGO DEL PREPARADOR ─────────────────────────────────────────────────────

async function loadTrainerLogo() {
  const { data } = await supabase
    .from('trainers')
    .select('logo_url')
    .eq('id', TRAINER_ID)
    .single()
  if (data?.logo_url) applyTrainerLogo(data.logo_url)
}

function applyTrainerLogo(url) {
  const img = document.getElementById('trainer-logo-img')
  img.src = url
  img.style.display = 'block'
  document.getElementById('trainer-logo-icon').style.display = 'none'
}

window.uploadTrainerLogo = async function(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { showNotif('Imagen demasiado grande (máx. 5 MB)'); return }

  showNotif('Subiendo logo...')
  const ext = file.name.split('.').pop()
  const path = `trainer-${TRAINER_ID}.${ext}`

  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) { showNotif('Error al subir el logo: ' + upErr.message); return }

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

  await supabase.from('trainers').update({ logo_url: publicUrl }).eq('id', TRAINER_ID)

  applyTrainerLogo(publicUrl)
  showNotif('Logo actualizado ✓ — aparecerá en el perfil de tus clientes')
  e.target.value = ''
}

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
  // Quitar highlight de "Mi perfil"
  const profileBtn = document.getElementById('my-profile-btn')
  if (profileBtn) { profileBtn.style.color = ''; profileBtn.style.borderColor = '' }
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
      <button class="tab-btn${ACTIVE_TAB==='profile'?' active':''}" data-tab="profile" onclick="switchTab('profile')"><i class="ti ti-user"></i> Perfil</button>
      <button class="tab-btn${ACTIVE_TAB==='workout'?' active':''}" data-tab="workout" onclick="switchTab('workout')"><i class="ti ti-barbell"></i> Entreno</button>
      <button class="tab-btn${ACTIVE_TAB==='diet'?' active':''}" data-tab="diet" onclick="switchTab('diet')"><i class="ti ti-apple"></i> Nutrición</button>
      <button class="tab-btn${ACTIVE_TAB==='cardio'?' active':''}" data-tab="cardio" onclick="switchTab('cardio')"><i class="ti ti-run"></i> Cardio</button>
      <button class="tab-btn${ACTIVE_TAB==='supplements'?' active':''}" data-tab="supplements" onclick="switchTab('supplements')"><i class="ti ti-pill"></i> Supls</button>
      <button class="tab-btn${ACTIVE_TAB==='measures'?' active':''}" data-tab="measures" onclick="switchTab('measures')"><i class="ti ti-ruler"></i> Medidas</button>
      <button class="tab-btn${ACTIVE_TAB==='progress'?' active':''}" data-tab="progress" onclick="switchTab('progress')"><i class="ti ti-chart-line"></i> Progreso</button>
    </div>

    <div id="tab-content"></div>
  `
  renderTab()
}

window.switchTab = function(tab) {
  ACTIVE_TAB = tab
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab)
  })
  renderTab()
}

function renderTab() {
  const el = document.getElementById('tab-content')
  if (!el) return
  if (ACTIVE_TAB === 'profile') renderProfileTab(el)
  else if (ACTIVE_TAB === 'workout') renderWorkoutTab(el)
  else if (ACTIVE_TAB === 'diet') renderDietTab(el)
  else if (ACTIVE_TAB === 'cardio') renderCardioTab(el)
  else if (ACTIVE_TAB === 'supplements') renderSupplementsTab(el)
  else if (ACTIVE_TAB === 'measures') renderMeasuresTab(el)
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
  const c = SELECTED_CLIENT_DATA.client
  el.innerHTML = `
    ${notesCard('wo-notes', c.notes_workout, 'saveWorkoutNotes', 'ti-barbell', 'Instrucciones de entrenamiento')}
    <div class="day-sel" id="wo-day-sel"></div>
    <div id="wo-day-content"></div>
  `
  renderWoDaySel()
  renderWoDay()
}

window.saveWorkoutNotes = async function() {
  const notes = document.getElementById('wo-notes').value
  const { error } = await supabase.from('clients').update({ notes_workout: notes }).eq('id', SELECTED_CLIENT)
  if (!error) { SELECTED_CLIENT_DATA.client.notes_workout = notes; showNotif('Instrucciones guardadas ✓') }
  else showNotif('Error: ' + error.message)
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
      <button class="check-btn" onclick="openEditEx('${ex.id}')" title="Editar" style="font-size:13px;margin-right:4px">✎</button>
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
  document.getElementById('ex-modal-save-btn').textContent = 'Guardar'
  document.getElementById('ex-modal').classList.add('open')
}

window.openEditEx = function(exId) {
  const day = SELECTED_CLIENT_DATA.workouts.find(d => d.day_index === ACTIVE_DAY)
  const ex = day?.workout_exercises?.find(e => e.id === exId)
  if (!ex) return
  currentWoDayId = day.id
  EDITING_EX_ID = exId
  document.getElementById('ex-name').value = ex.name
  document.getElementById('ex-sets').value = ex.sets_reps
  document.getElementById('ex-note').value = ex.note || ''
  document.getElementById('ex-modal-title').textContent = 'Editar ejercicio'
  document.getElementById('ex-modal-save-btn').textContent = 'Guardar cambios'
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

  if (EDITING_EX_ID) {
    const { error } = await supabase
      .from('workout_exercises')
      .update({ name, sets_reps, note: note || null })
      .eq('id', EDITING_EX_ID)
    if (!error && day) {
      const ex = day.workout_exercises.find(e => e.id === EDITING_EX_ID)
      if (ex) { ex.name = name; ex.sets_reps = sets_reps; ex.note = note || null }
      document.getElementById('wo-ex-list').innerHTML = renderExList(day.workout_exercises)
      closeExModal()
      showNotif('Ejercicio actualizado ✓')
    }
  } else {
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
  const c = SELECTED_CLIENT_DATA.client
  const meals = (diet?.diet_meals || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  el.innerHTML = `
    ${notesCard('diet-notes', c.notes_diet, 'saveDietNotes', 'ti-apple', 'Instrucciones de nutrición')}
    <div class="card" id="meals-container">
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

  initMealDrag()
}

window.saveDietNotes = async function() {
  const notes = document.getElementById('diet-notes').value
  const { error } = await supabase.from('clients').update({ notes_diet: notes }).eq('id', SELECTED_CLIENT)
  if (!error) { SELECTED_CLIENT_DATA.client.notes_diet = notes; showNotif('Instrucciones guardadas ✓') }
  else showNotif('Error: ' + error.message)
}

function renderMealCard(meal) {
  return `
    <div class="meal-card-drag" data-meal-id="${meal.id}"
      style="margin-bottom:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:14px;transition:opacity .15s,border-color .15s">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div class="drag-handle" title="Arrastrar para reordenar"
          style="cursor:grab;color:var(--text3);font-size:18px;line-height:1;padding:2px 4px;user-select:none;flex-shrink:0">⠿</div>
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

let _dragMealId = null
let _dragOver = null

function initMealDrag() {
  const cards = document.querySelectorAll('.meal-card-drag')
  cards.forEach(card => {
    const handle = card.querySelector('.drag-handle')

    // Solo arrastrar desde el handle
    handle.addEventListener('mousedown', () => { card.draggable = true })
    card.addEventListener('dragend',    () => { card.draggable = false })

    card.addEventListener('dragstart', e => {
      _dragMealId = card.dataset.mealId
      e.dataTransfer.effectAllowed = 'move'
      setTimeout(() => card.style.opacity = '0.4', 0)
    })

    card.addEventListener('dragend', () => {
      card.style.opacity = ''
      card.style.borderColor = ''
      _dragMealId = null
      _dragOver = null
    })

    card.addEventListener('dragover', e => {
      e.preventDefault()
      if (card.dataset.mealId === _dragMealId) return
      if (_dragOver && _dragOver !== card) _dragOver.style.borderColor = ''
      _dragOver = card
      card.style.borderColor = 'var(--blue)'
    })

    card.addEventListener('dragleave', () => {
      card.style.borderColor = ''
    })

    card.addEventListener('drop', e => {
      e.preventDefault()
      card.style.borderColor = ''
      if (!_dragMealId || _dragMealId === card.dataset.mealId) return

      const meals = SELECTED_CLIENT_DATA.diet.diet_meals
      const fromIdx = meals.findIndex(m => m.id === _dragMealId)
      const toIdx   = meals.findIndex(m => m.id === card.dataset.mealId)
      if (fromIdx < 0 || toIdx < 0) return

      const [moved] = meals.splice(fromIdx, 1)
      meals.splice(toIdx, 0, moved)

      // Actualizar order_index en memoria y en DB
      meals.forEach((m, i) => { m.order_index = i })
      saveMealOrder(meals)
      renderTab()
    })
  })
}

async function saveMealOrder(meals) {
  await Promise.all(meals.map((m, i) =>
    supabase.from('diet_meals').update({ order_index: i }).eq('id', m.id)
  ))
}

function renderFoodRow(food, mealId) {
  return `<div class="row" id="food-row-${food.id}">
    <div style="flex:1"><div class="row-name" style="font-size:13px">${food.name}</div></div>
    ${food.protein_g ? `<span class="tag" style="margin-right:4px">${food.protein_g}g prot</span>` : ''}
    ${food.kcal ? `<span class="tag" style="margin-right:6px">${food.kcal}kcal</span>` : ''}
    <button class="check-btn" onclick="openEditFood('${food.id}','${mealId}')" title="Editar" style="font-size:13px;margin-right:4px">✎</button>
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
let EDITING_FOOD_ID = null

window.openAddFood = function(mealId) {
  ACTIVE_MEAL_ID = mealId
  EDITING_FOOD_ID = null
  document.getElementById('fd-name').value = ''
  document.getElementById('fd-prot').value = ''
  document.getElementById('fd-kcal').value = ''
  document.querySelector('#food-modal .modal-title').textContent = 'Añadir alimento'
  document.getElementById('fd-save-btn').textContent = 'Guardar'
  document.getElementById('food-modal').classList.add('open')
}

window.openEditFood = function(foodId, mealId) {
  const meal = SELECTED_CLIENT_DATA.diet?.diet_meals?.find(m => m.id === mealId)
  const food = meal?.diet_foods?.find(f => f.id === foodId)
  if (!food) return
  ACTIVE_MEAL_ID = mealId
  EDITING_FOOD_ID = foodId
  document.getElementById('fd-name').value = food.name
  document.getElementById('fd-prot').value = food.protein_g || ''
  document.getElementById('fd-kcal').value = food.kcal || ''
  document.querySelector('#food-modal .modal-title').textContent = 'Editar alimento'
  document.getElementById('fd-save-btn').textContent = 'Guardar cambios'
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

  if (EDITING_FOOD_ID) {
    const { error } = await supabase
      .from('diet_foods')
      .update({ name, protein_g, kcal })
      .eq('id', EDITING_FOOD_ID)
    if (!error && meal) {
      const food = meal.diet_foods.find(f => f.id === EDITING_FOOD_ID)
      if (food) { food.name = name; food.protein_g = protein_g; food.kcal = kcal }
      const foodsEl = document.getElementById(`foods-in-${ACTIVE_MEAL_ID}`)
      if (foodsEl) foodsEl.innerHTML = meal.diet_foods.map(f => renderFoodRow(f, ACTIVE_MEAL_ID)).join('')
      closeFoodModal()
      showNotif('Alimento actualizado ✓')
    }
  } else {
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

const SUPL_TIMINGS = [
  { value: 'manana',       label: 'Mañana',       icon: 'ti-sunrise',    color: '#BA7517' },
  { value: 'tarde',        label: 'Tarde',         icon: 'ti-sun',        color: '#378ADD' },
  { value: 'noche',        label: 'Noche',         icon: 'ti-moon',       color: '#7C5CBF' },
  { value: 'pre-workout',  label: 'Pre-workout',   icon: 'ti-bolt',       color: '#1D9E75' },
  { value: 'post-workout', label: 'Post-workout',  icon: 'ti-check',      color: '#E24B4A' },
]

function timingTag(timing) {
  if (!timing) return ''
  const t = SUPL_TIMINGS.find(t => t.value === timing)
  if (!t) return ''
  return `<span class="tag" style="margin-right:4px;border-color:${t.color}44;color:${t.color}"><i class="ti ${t.icon}" style="font-size:11px"></i> ${t.label}</span>`
}

function timingSelect(id, selected) {
  return `<select id="${id}" style="padding:7px 10px;border-radius:var(--radius-sm);border:1px solid var(--border2);background:var(--bg3);color:var(--text);font-size:13px;font-family:inherit;width:100%">
    <option value="">Sin horario</option>
    ${SUPL_TIMINGS.map(t => `<option value="${t.value}" ${selected === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
  </select>`
}

function renderSupplementsTab(el) {
  const { supplements } = SELECTED_CLIENT_DATA
  const c = SELECTED_CLIENT_DATA.client
  el.innerHTML = `
    ${notesCard('supls-notes', c.notes_supls, 'saveSuplsNotes', 'ti-pill', 'Instrucciones de suplementación')}
    <div class="card">
      <div class="card-title"><i class="ti ti-pill"></i> Suplementación</div>
      <div id="supls-admin-list">
        ${supplements.map(s => renderSuplRow(s)).join('') || '<div style="font-size:12px;color:var(--text3)">Sin suplementos asignados</div>'}
      </div>
      <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:8px">
          <input type="text" id="s-name" placeholder="Nombre (ej: Creatina)">
          <input type="text" id="s-dose" placeholder="Dosis (ej: 5g)">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <input type="number" id="s-prot" placeholder="Proteína (g)" min="0">
          <input type="number" id="s-kcal" placeholder="Kcal" min="0">
        </div>
        <div style="display:flex;gap:8px">
          ${timingSelect('s-timing', '')}
          <button class="btn btn-primary" onclick="addSupplement()" style="flex-shrink:0"><i class="ti ti-plus"></i></button>
        </div>
      </div>
    </div>
  `
}

function renderSuplRow(s) {
  return `<div class="row" id="supl-row-${s.id}">
    <div style="flex:1">
      <div class="row-name">${s.name}</div>
      ${s.dose ? `<div class="row-note">${s.dose}</div>` : ''}
    </div>
    ${timingTag(s.timing)}
    ${s.protein_g ? `<span class="tag" style="margin-right:4px">${s.protein_g}g prot</span>` : ''}
    ${s.kcal ? `<span class="tag" style="margin-right:4px">${s.kcal}kcal</span>` : ''}
    <button class="check-btn" onclick="openEditSupl('${s.id}')" title="Editar" style="font-size:13px;margin-right:4px">✎</button>
    <button class="check-btn" onclick="deleteSupplement('${s.id}')" style="font-size:12px">×</button>
  </div>`
}

function renderSuplEditRow(s) {
  return `<div class="row" id="supl-row-${s.id}" style="flex-wrap:wrap;gap:6px;align-items:flex-start">
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;width:100%;margin-bottom:6px">
      <input type="text" id="sedit-name-${s.id}" value="${s.name}" placeholder="Nombre" style="font-size:13px">
      <input type="text" id="sedit-dose-${s.id}" value="${s.dose || ''}" placeholder="Dosis" style="font-size:13px">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;width:100%;margin-bottom:6px">
      <input type="number" id="sedit-prot-${s.id}" value="${s.protein_g || ''}" placeholder="Proteína (g)" min="0" style="font-size:13px">
      <input type="number" id="sedit-kcal-${s.id}" value="${s.kcal || ''}" placeholder="Kcal" min="0" style="font-size:13px">
    </div>
    <div style="display:flex;gap:6px;width:100%">
      ${timingSelect('sedit-timing-' + s.id, s.timing)}
      <button class="btn btn-primary" onclick="saveEditSupl('${s.id}')" style="font-size:12px;padding:6px 10px">✓</button>
      <button class="btn" onclick="cancelEditSupl('${s.id}')" style="font-size:12px;padding:6px 10px">✕</button>
    </div>
  </div>`
}

window.saveSuplsNotes = async function() {
  const notes = document.getElementById('supls-notes').value
  const { error } = await supabase.from('clients').update({ notes_supls: notes }).eq('id', SELECTED_CLIENT)
  if (!error) { SELECTED_CLIENT_DATA.client.notes_supls = notes; showNotif('Instrucciones guardadas ✓') }
  else showNotif('Error: ' + error.message)
}

window.addSupplement = async function() {
  const name = document.getElementById('s-name').value.trim()
  const dose = document.getElementById('s-dose').value.trim()
  const protein_g = parseInt(document.getElementById('s-prot').value) || 0
  const kcal = parseInt(document.getElementById('s-kcal').value) || 0
  const timing = document.getElementById('s-timing').value || null
  if (!name) return

  const order_index = SELECTED_CLIENT_DATA.supplements.length
  const { data: s } = await supabase
    .from('supplements')
    .insert({ client_id: SELECTED_CLIENT, name, dose, protein_g, kcal, timing, order_index })
    .select().single()

  SELECTED_CLIENT_DATA.supplements.push(s)
  document.getElementById('supls-admin-list').innerHTML =
    SELECTED_CLIENT_DATA.supplements.map(s => renderSuplRow(s)).join('')
  document.getElementById('s-name').value = ''
  document.getElementById('s-dose').value = ''
  document.getElementById('s-prot').value = ''
  document.getElementById('s-kcal').value = ''
  document.getElementById('s-timing').value = ''
  showNotif('Suplemento añadido ✓')
}

window.openEditSupl = function(id) {
  const s = SELECTED_CLIENT_DATA.supplements.find(s => s.id === id)
  if (!s) return
  const row = document.getElementById(`supl-row-${id}`)
  if (row) row.outerHTML = renderSuplEditRow(s)
}

window.cancelEditSupl = function(id) {
  const s = SELECTED_CLIENT_DATA.supplements.find(s => s.id === id)
  if (!s) return
  const row = document.getElementById(`supl-row-${id}`)
  if (row) row.outerHTML = renderSuplRow(s)
}

window.saveEditSupl = async function(id) {
  const name = document.getElementById(`sedit-name-${id}`).value.trim()
  const dose = document.getElementById(`sedit-dose-${id}`).value.trim()
  const protein_g = parseInt(document.getElementById(`sedit-prot-${id}`).value) || 0
  const kcal = parseInt(document.getElementById(`sedit-kcal-${id}`).value) || 0
  const timing = document.getElementById(`sedit-timing-${id}`).value || null
  if (!name) { showNotif('El nombre es obligatorio'); return }

  const { error } = await supabase.from('supplements').update({ name, dose, protein_g, kcal, timing }).eq('id', id)
  if (error) { showNotif('Error al guardar: ' + error.message); return }

  const s = SELECTED_CLIENT_DATA.supplements.find(s => s.id === id)
  if (s) { s.name = name; s.dose = dose; s.protein_g = protein_g; s.kcal = kcal; s.timing = timing }
  const row = document.getElementById(`supl-row-${id}`)
  if (row) row.outerHTML = renderSuplRow(s)
  showNotif('Suplemento actualizado ✓')
}

window.deleteSupplement = async function(id) {
  await supabase.from('supplements').delete().eq('id', id)
  SELECTED_CLIENT_DATA.supplements = SELECTED_CLIENT_DATA.supplements.filter(s => s.id !== id)
  document.getElementById('supls-admin-list').innerHTML =
    SELECTED_CLIENT_DATA.supplements.map(s => renderSuplRow(s)).join('')
}

// ─── TAB: PROGRESO ────────────────────────────────────────────────────────────

// ─── TAB: CARDIO ──────────────────────────────────────────────────────────────

async function renderCardioTab(el) {
  const c = SELECTED_CLIENT_DATA.client

  // Cargar últimos 30 días para el resumen
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando...</div>'
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data: logs } = await supabase
    .from('daily_logs')
    .select('log_date, steps, cardio_min')
    .eq('client_id', SELECTED_CLIENT)
    .gte('log_date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('log_date', { ascending: true })

  const allLogs = logs || []
  const avgSteps = allLogs.length ? Math.round(allLogs.reduce((a, l) => a + (l.steps || 0), 0) / allLogs.length) : 0
  const totalCardio = allLogs.reduce((a, l) => a + (l.cardio_min || 0), 0)
  const avgCardioWeek = Math.round(totalCardio / 4)
  const stepsWithData = allLogs.filter(l => l.steps > 0)

  el.innerHTML = `
    ${notesCard('cardio-notes', c.notes_cardio, 'saveCardioNotes', 'ti-run', 'Instrucciones de cardio')}
    <div class="metric-grid">
      <div class="metric">
        <div class="metric-label">Media pasos/día</div>
        <div class="metric-val">${avgSteps.toLocaleString('es-ES')}</div>
        <div class="metric-sub">objetivo: ${(c.steps_goal || 9000).toLocaleString('es-ES')}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Cardio semanal</div>
        <div class="metric-val">${avgCardioWeek} min</div>
        <div class="metric-sub">objetivo: ${c.cardio_goal_min || 185} min</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-target"></i> Objetivos de cardio</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Pasos diarios objetivo</label>
          <input type="number" id="c-steps" value="${c.steps_goal || 9000}" min="1000" max="30000" step="500">
        </div>
        <div class="form-group">
          <label class="form-label">Cardio semanal (min)</label>
          <input type="number" id="c-cardio" value="${c.cardio_goal_min || 185}" min="0" max="600" step="15">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Recordatorio de movimiento</label>
        <select id="c-reminder" style="width:100%;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border2);background:var(--bg3);color:var(--text);font-size:13px;font-family:inherit">
          <option value="">Sin recordatorio</option>
          <option value="20" ${c.reminder_interval_min === 20 ? 'selected' : ''}>Cada 20 min</option>
          <option value="30" ${c.reminder_interval_min === 30 ? 'selected' : ''}>Cada 30 min</option>
          <option value="45" ${c.reminder_interval_min === 45 ? 'selected' : ''}>Cada 45 min</option>
          <option value="60" ${c.reminder_interval_min === 60 ? 'selected' : ''}>Cada 60 min</option>
        </select>
      </div>
      <button class="btn btn-primary" onclick="saveCardioConfig()" style="width:100%">Guardar cardio</button>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-run"></i> Tipos de cardio asignados</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Selecciona los tipos de cardio recomendados para este cliente</div>
      <div id="cardio-types-grid" style="display:flex;flex-wrap:wrap;gap:8px">
        ${CARDIO_TYPES.map(t => {
          const active = (c.cardio_types || []).includes(t.id)
          return `<button type="button" onclick="toggleCardioType('${t.id}')"
            data-ctype="${t.id}"
            style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:20px;border:1.5px solid ${active ? 'var(--blue)' : 'var(--border2)'};
            background:${active ? 'var(--blue)22' : 'var(--bg3)'};color:${active ? 'var(--blue)' : 'var(--text2)'};
            font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;font-family:inherit">
            <i class="ti ${t.icon}" style="font-size:14px"></i>${t.label}
          </button>`
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-shoe"></i> Pasos últimos 30 días</div>
      ${stepsWithData.length >= 2
        ? `<div style="position:relative;height:140px"><canvas id="steps-chart"></canvas></div>`
        : `<div style="font-size:12px;color:var(--text3)">Sin datos suficientes</div>`}
    </div>

    <div class="card">
      <div class="card-title"><i class="ti ti-clock"></i> Cardio por día (últimos 30 días)</div>
      ${allLogs.filter(l => l.cardio_min > 0).length
        ? allLogs.filter(l => l.cardio_min > 0).slice(-10).reverse().map(l =>
            `<div class="row">
              <span style="font-size:12px;color:var(--text2)">${l.log_date}</span>
              <div style="display:flex;gap:8px;align-items:center">
                ${l.steps ? `<span class="tag"><i class="ti ti-shoe"></i> ${l.steps.toLocaleString('es-ES')} pasos</span>` : ''}
                <span class="tag"><i class="ti ti-clock"></i> ${l.cardio_min} min</span>
              </div>
            </div>`
          ).join('')
        : `<div style="font-size:12px;color:var(--text3)">Sin registros de cardio</div>`}
    </div>
  `

  if (stepsWithData.length >= 2) {
    // @ts-ignore
    new Chart(document.getElementById('steps-chart'), {
      type: 'bar',
      data: {
        labels: stepsWithData.map(l => l.log_date.slice(5)),
        datasets: [{
          label: 'Pasos',
          data: stepsWithData.map(l => l.steps),
          backgroundColor: stepsWithData.map(l => l.steps >= (c.steps_goal || 9000) ? '#1D9E7588' : '#378ADD55'),
          borderColor: stepsWithData.map(l => l.steps >= (c.steps_goal || 9000) ? '#1D9E75' : '#378ADD'),
          borderWidth: 1, borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: '#a0a0a0' }, grid: { color: '#2a2a2a' } },
          x: { ticks: { color: '#a0a0a0', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } }
        }
      }
    })
  }
}

window.toggleCardioType = function(id) {
  const client = SELECTED_CLIENT_DATA.client
  const types = [...(client.cardio_types || [])]
  const idx = types.indexOf(id)
  if (idx >= 0) types.splice(idx, 1)
  else types.push(id)
  client.cardio_types = types

  // Actualizar visual del botón
  const btn = document.querySelector(`[data-ctype="${id}"]`)
  if (!btn) return
  const active = types.includes(id)
  btn.style.borderColor = active ? 'var(--blue)' : 'var(--border2)'
  btn.style.background  = active ? 'var(--blue)22' : 'var(--bg3)'
  btn.style.color       = active ? 'var(--blue)' : 'var(--text2)'
}

window.saveCardioNotes = async function() {
  const notes = document.getElementById('cardio-notes').value
  const { error } = await supabase.from('clients').update({ notes_cardio: notes }).eq('id', SELECTED_CLIENT)
  if (!error) { SELECTED_CLIENT_DATA.client.notes_cardio = notes; showNotif('Instrucciones guardadas ✓') }
  else showNotif('Error: ' + error.message)
}

window.saveCardioConfig = async function() {
  const steps    = parseInt(document.getElementById('c-steps').value) || 9000
  const cardio   = parseInt(document.getElementById('c-cardio').value) || 185
  const reminder = parseInt(document.getElementById('c-reminder').value) || null
  const types    = SELECTED_CLIENT_DATA.client.cardio_types || []

  const { error } = await supabase.from('clients').update({
    steps_goal: steps,
    cardio_goal_min: cardio,
    reminder_interval_min: reminder,
    cardio_types: types,
  }).eq('id', SELECTED_CLIENT)

  if (!error) {
    Object.assign(SELECTED_CLIENT_DATA.client, { steps_goal: steps, cardio_goal_min: cardio, reminder_interval_min: reminder, cardio_types: types })
    showNotif('Cardio guardado ✓')
  } else {
    showNotif('Error: ' + error.message)
  }
}

// ─── TAB: MEDIDAS ─────────────────────────────────────────────────────────────

async function renderMeasuresTab(el) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando...</div>'

  const { data: rows } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('client_id', SELECTED_CLIENT)
    .order('measured_at', { ascending: false })

  const all = rows || []
  const latest = all[0]
  const prev = all[1]

  function delta(field) {
    if (!latest || !prev || latest[field] == null || prev[field] == null) return ''
    const d = (latest[field] - prev[field]).toFixed(1)
    const col = parseFloat(d) < 0 ? 'var(--green)' : parseFloat(d) > 0 ? 'var(--red)' : 'var(--text2)'
    return `<span style="font-size:11px;color:${col};margin-left:4px">${parseFloat(d) > 0 ? '+' : ''}${d}</span>`
  }

  function metricRow(label, field, unit = 'cm') {
    const val = latest?.[field] != null ? `${latest[field]} ${unit}` : '—'
    return `<div class="metric">
      <div class="metric-label">${label}</div>
      <div class="metric-val">${val}${delta(field)}</div>
      <div class="metric-sub">${prev?.[field] != null ? `Ant: ${prev[field]} ${unit}` : 'Sin anterior'}</div>
    </div>`
  }

  function histTag(label, field, r) {
    return r[field] != null ? `<span class="tag">${label} ${r[field]}</span>` : ''
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-plus"></i> Añadir medición</div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input type="date" id="m-date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
        <div class="form-group"><label class="form-label">Peso (kg)</label><input type="number" id="m-weight" placeholder="72.5" step="0.1" min="30" max="300"></div>
        <div class="form-group"><label class="form-label">% Grasa</label><input type="number" id="m-fat" placeholder="18" step="0.1" min="3" max="60"></div>
        <div class="form-group"><label class="form-label">Hombros (cm)</label><input type="number" id="m-shoulder" placeholder="110" step="0.5"></div>
        <div class="form-group"><label class="form-label">Pecho (cm)</label><input type="number" id="m-chest" placeholder="90" step="0.5"></div>
        <div class="form-group"><label class="form-label">Brazo D (cm)</label><input type="number" id="m-arm-r" placeholder="32" step="0.5"></div>
        <div class="form-group"><label class="form-label">Brazo I (cm)</label><input type="number" id="m-arm-l" placeholder="32" step="0.5"></div>
        <div class="form-group"><label class="form-label">Cintura (cm)</label><input type="number" id="m-waist" placeholder="78" step="0.5"></div>
        <div class="form-group"><label class="form-label">Cadera (cm)</label><input type="number" id="m-hips" placeholder="96" step="0.5"></div>
        <div class="form-group"><label class="form-label">Muslo D (cm)</label><input type="number" id="m-thigh-r" placeholder="55" step="0.5"></div>
        <div class="form-group"><label class="form-label">Muslo I (cm)</label><input type="number" id="m-thigh-l" placeholder="55" step="0.5"></div>
        <div class="form-group"><label class="form-label">Gemelo D (cm)</label><input type="number" id="m-calf-r" placeholder="36" step="0.5"></div>
        <div class="form-group"><label class="form-label">Gemelo I (cm)</label><input type="number" id="m-calf-l" placeholder="36" step="0.5"></div>
        <div class="form-group" style="grid-column:span 3"><label class="form-label">Notas</label><div style="display:flex;gap:6px"><input type="text" id="m-notes" placeholder="Ej: en ayunas, por la mañana" style="flex:1">${voiceMicBtn('m-notes')}</div></div>
      </div>
      <button class="btn btn-primary" onclick="saveMeasurement()" style="width:100%;margin-top:4px">
        <i class="ti ti-plus"></i> Guardar medición
      </button>
    </div>

    ${latest ? `
    <div class="card">
      <div class="card-title"><i class="ti ti-ruler"></i> Última medición — ${latest.measured_at}
        ${prev ? `<span style="font-size:11px;color:var(--text2);font-weight:400;margin-left:6px">vs ${prev.measured_at}</span>` : ''}
      </div>
      <div class="metric-grid">
        ${metricRow('Peso', 'weight_kg', 'kg')}
        ${metricRow('% Grasa', 'body_fat_pct', '%')}
        ${metricRow('Hombros', 'shoulder_cm')}
        ${metricRow('Pecho', 'chest_cm')}
        ${metricRow('Brazo D', 'arm_r_cm')}
        ${metricRow('Brazo I', 'arm_l_cm')}
        ${metricRow('Cintura', 'waist_cm')}
        ${metricRow('Cadera', 'hips_cm')}
        ${metricRow('Muslo D', 'thigh_r_cm')}
        ${metricRow('Muslo I', 'thigh_l_cm')}
        ${metricRow('Gemelo D', 'calf_r_cm')}
        ${metricRow('Gemelo I', 'calf_l_cm')}
      </div>
    </div>` : ''}

    ${all.length > 0 ? `
    <div class="card">
      <div class="card-title"><i class="ti ti-history"></i> Historial</div>
      ${all.map(r => `
        <div class="row" style="align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="min-width:90px;font-size:12px;color:var(--text2)">${r.measured_at}</div>
          <div style="flex:1;display:flex;flex-wrap:wrap;gap:5px">
            ${r.weight_kg != null ? `<span class="tag">${r.weight_kg} kg</span>` : ''}
            ${r.body_fat_pct != null ? `<span class="tag">${r.body_fat_pct}% grasa</span>` : ''}
            ${histTag('Hom', 'shoulder_cm', r)}
            ${histTag('Pec', 'chest_cm', r)}
            ${histTag('BraD', 'arm_r_cm', r)}
            ${histTag('BraI', 'arm_l_cm', r)}
            ${histTag('Cin', 'waist_cm', r)}
            ${histTag('Cad', 'hips_cm', r)}
            ${histTag('MusD', 'thigh_r_cm', r)}
            ${histTag('MusI', 'thigh_l_cm', r)}
            ${histTag('GemD', 'calf_r_cm', r)}
            ${histTag('GemI', 'calf_l_cm', r)}
            ${r.notes ? `<span style="font-size:11px;color:var(--text2);align-self:center">${r.notes}</span>` : ''}
          </div>
          <button onclick="deleteMeasurement('${r.id}')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:16px;padding:0 4px">×</button>
        </div>`).join('')}
    </div>` : `<div class="card" style="text-align:center;padding:30px;color:var(--text2);font-size:13px">
      <i class="ti ti-ruler" style="font-size:32px;display:block;margin-bottom:8px;color:var(--text3)"></i>
      Sin mediciones registradas todavía
    </div>`}
  `
}

window.saveMeasurement = async function() {
  const val = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v }
  const entry = {
    client_id: SELECTED_CLIENT,
    measured_at: document.getElementById('m-date').value,
    weight_kg: val('m-weight'),
    body_fat_pct: val('m-fat'),
    waist_cm: val('m-waist'),
    hips_cm: val('m-hips'),
    chest_cm: val('m-chest'),
    shoulder_cm: val('m-shoulder'),
    arm_r_cm: val('m-arm-r'),
    arm_l_cm: val('m-arm-l'),
    thigh_r_cm: val('m-thigh-r'),
    thigh_l_cm: val('m-thigh-l'),
    calf_r_cm: val('m-calf-r'),
    calf_l_cm: val('m-calf-l'),
    notes: document.getElementById('m-notes').value.trim() || null,
  }
  if (!entry.measured_at) { showNotif('Elige una fecha.'); return }
  const hasData = Object.entries(entry).some(([k, v]) => !['client_id','measured_at','notes'].includes(k) && v != null)
  if (!hasData) { showNotif('Introduce al menos un valor.'); return }

  const { error } = await supabase.from('body_measurements').insert(entry)
  if (error) { showNotif('Error: ' + error.message); return }
  showNotif('Medición guardada ✓')
  renderMeasuresTab(document.getElementById('tab-content'))
}

window.deleteMeasurement = async function(id) {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id)
  if (error) { showNotif('Error: ' + error.message); return }
  showNotif('Medición eliminada')
  renderMeasuresTab(document.getElementById('tab-content'))
}

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

// ─── INVITACIONES ─────────────────────────────────────────────────────────────

let CURRENT_INVITE_LINK = ''

window.openInviteModal = function() {
  document.getElementById('invite-form-view').style.display = 'block'
  document.getElementById('invite-link-view').style.display = 'none'
  document.getElementById('inv-name').value = ''
  document.getElementById('inv-email-input').value = ''
  document.getElementById('inv-error').style.display = 'none'
  document.getElementById('inv-btn').textContent = 'Generar link de invitación'
  document.getElementById('inv-btn').disabled = false
  document.getElementById('invite-modal').classList.add('open')
}

window.closeInviteModal = function() {
  document.getElementById('invite-modal').classList.remove('open')
}

window.createInvite = async function() {
  const name  = document.getElementById('inv-name').value.trim()
  const email = document.getElementById('inv-email-input').value.trim()
  const errEl = document.getElementById('inv-error')
  const btn   = document.getElementById('inv-btn')

  errEl.style.display = 'none'
  if (!name)  { errEl.textContent = 'Introduce el nombre del cliente.'; errEl.style.display = 'block'; return }
  if (!email) { errEl.textContent = 'Introduce el email del cliente.';  errEl.style.display = 'block'; return }

  btn.textContent = 'Generando...'
  btn.disabled = true

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      trainer_id: TRAINER_ID,
      client_name: name,
      client_email: email,
      trainer_name: document.getElementById('trainer-name-logo').textContent.trim(),
    })
    .select('token')
    .single()

  if (error) {
    errEl.textContent = 'Error al generar el link: ' + error.message
    errEl.style.display = 'block'
    btn.textContent = 'Generar link de invitación'
    btn.disabled = false
    return
  }

  const base = window.location.origin + window.location.pathname.replace('trainer.html', '')
  CURRENT_INVITE_LINK = `${base}invite.html?token=${data.token}`

  document.getElementById('invite-link-text').textContent = CURRENT_INVITE_LINK
  document.getElementById('invite-form-view').style.display = 'none'
  document.getElementById('invite-link-view').style.display = 'block'
}

window.copyInviteLink = function() {
  navigator.clipboard.writeText(CURRENT_INVITE_LINK).then(() => {
    const btn = document.getElementById('copy-btn')
    btn.textContent = '✓ Copiado'
    setTimeout(() => { btn.innerHTML = '<i class="ti ti-copy"></i> Copiar link' }, 2000)
  })
}

// ─── MI PERFIL / DASHBOARD NEGOCIO ───────────────────────────────────────────

let TRAINER_PROFILE_SNAPSHOT = null

window.openMyProfile = async function() {
  document.getElementById('my-profile-btn').style.color = 'var(--blue)'
  document.getElementById('my-profile-btn').style.borderColor = 'var(--blue)'

  const main = document.getElementById('main-content')
  main.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div>'

  const today = new Date().toISOString().split('T')[0]
  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6)
  const sevenAgoStr = sevenAgo.toISOString().split('T')[0]

  const clientIds = ALL_CLIENTS.map(c => c.id)

  const [
    { data: trainerData },
    { data: profileData },
    { data: todayLogs },
    { data: weekLogs },
  ] = await Promise.all([
    supabase.from('trainers').select('bio, specialty, max_clients, subscription_status, trial_ends_at').eq('id', TRAINER_ID).single(),
    supabase.from('profiles').select('full_name, email').eq('id', TRAINER_ID).single(),
    clientIds.length
      ? supabase.from('daily_logs').select('client_id, score').eq('log_date', today).in('client_id', clientIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase.from('daily_logs').select('client_id, score').gte('log_date', sevenAgoStr).in('client_id', clientIds)
      : Promise.resolve({ data: [] }),
  ])

  TRAINER_PROFILE_SNAPSHOT = {
    full_name: profileData?.full_name || '',
    bio: trainerData?.bio || '',
    specialty: trainerData?.specialty || '',
    max_clients: trainerData?.max_clients ?? 20,
  }

  const activeClients   = ALL_CLIENTS.filter(c => c.active !== false)
  const inactiveClients = ALL_CLIENTS.filter(c => c.active === false)

  // Score medio semanal por cliente
  const scoreByClient = {}
  ;(weekLogs || []).forEach(l => {
    if (l.score == null) return
    if (!scoreByClient[l.client_id]) scoreByClient[l.client_id] = []
    scoreByClient[l.client_id].push(l.score)
  })
  const avgScores = Object.entries(scoreByClient).map(([id, scores]) => ({
    id,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    name: ALL_CLIENTS.find(c => c.id === id)?.profiles?.full_name || '—',
  })).sort((a, b) => b.avg - a.avg)

  const globalAvg = avgScores.length
    ? Math.round(avgScores.reduce((a, c) => a + c.avg, 0) / avgScores.length)
    : null

  // Quién ha registrado hoy
  const loggedToday = new Set((todayLogs || []).map(l => l.client_id))
  const atRisk = activeClients.filter(c => !loggedToday.has(c.id))

  // Suscripción
  const subStatus = trainerData?.subscription_status || 'trial'
  const subColors = { trial: '#BA7517', active: '#1D9E75', inactive: '#E24B4A' }
  const subLabels = { trial: 'Trial', active: 'Pro activo', inactive: 'Sin suscripción' }
  const trialEnd = trainerData?.trial_ends_at
    ? new Date(trainerData.trial_ends_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : null

  renderMyProfileView({
    snap: TRAINER_PROFILE_SNAPSHOT,
    email: profileData?.email || '',
    activeClients, inactiveClients,
    globalAvg, avgScores,
    loggedToday, atRisk,
    subStatus, subColors, subLabels, trialEnd,
  })
}

function renderMyProfileView({ snap, email, activeClients, inactiveClients, globalAvg, avgScores, loggedToday, atRisk, subStatus, subColors, subLabels, trialEnd }) {
  const main = document.getElementById('main-content')

  const scoreColor = s => s >= 80 ? 'var(--green)' : s >= 50 ? 'var(--amber)' : 'var(--red)'
  const scoreBar = s => `<div style="height:4px;border-radius:2px;background:var(--border);margin-top:4px"><div style="height:4px;border-radius:2px;background:${scoreColor(s)};width:${s}%"></div></div>`

  main.innerHTML = `
    <!-- CABECERA -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:20px;font-weight:700;margin:0">${escHtml(snap.full_name) || 'Mi negocio'}</h2>
        ${snap.specialty ? `<div style="font-size:13px;color:var(--text2);margin-top:3px">${escHtml(snap.specialty)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;background:${subColors[subStatus]}22;color:${subColors[subStatus]};border:1px solid ${subColors[subStatus]}44">
          ● ${subLabels[subStatus]}${trialEnd ? ' · hasta ' + trialEnd : ''}
        </span>
        <button class="btn" onclick="openImportModal()" style="font-size:12px;gap:6px;border-color:var(--green);color:var(--green)">
          <i class="ti ti-file-import"></i> Importar clientes
        </button>
        <button class="btn" onclick="toggleProfileEdit()" style="font-size:12px;gap:6px">
          <i class="ti ti-pencil"></i> Editar
        </button>
      </div>
    </div>

    <!-- MÉTRICAS GRANDES -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="card" style="text-align:center;padding:16px 10px">
        <div style="font-size:36px;font-weight:800;color:var(--blue);line-height:1">${activeClients.length}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:6px;font-weight:500">ACTIVOS</div>
      </div>
      <div class="card" style="text-align:center;padding:16px 10px">
        <div style="font-size:36px;font-weight:800;color:var(--text3);line-height:1">${inactiveClients.length}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:6px;font-weight:500">INACTIVOS</div>
      </div>
      <div class="card" style="text-align:center;padding:16px 10px">
        <div style="font-size:36px;font-weight:800;color:${globalAvg != null ? scoreColor(globalAvg) : 'var(--text3)'};line-height:1">${globalAvg != null ? globalAvg + '%' : '—'}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:6px;font-weight:500">MEDIA 7 DÍAS</div>
      </div>
      <div class="card" style="text-align:center;padding:16px 10px">
        <div style="font-size:36px;font-weight:800;color:${atRisk.length > 0 ? 'var(--amber)' : 'var(--green)'};line-height:1">${atRisk.length}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:6px;font-weight:500">SIN HOY</div>
      </div>
    </div>

    <!-- DOS COLUMNAS -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">

      <!-- ACTIVIDAD HOY -->
      <div class="card" style="padding:14px">
        <div class="card-title" style="margin-bottom:10px"><i class="ti ti-calendar-today"></i> Actividad hoy</div>
        ${activeClients.length === 0
          ? '<div style="font-size:12px;color:var(--text3)">Sin clientes activos</div>'
          : activeClients.map(c => {
              const logged = loggedToday.has(c.id)
              const todayScore = logged ? (Array.from(loggedToday).includes(c.id) ? null : null) : null
              return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:15px">${logged ? '✅' : '⬜'}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.profiles?.full_name || '—')}</div>
                </div>
                <span style="font-size:11px;color:${logged ? 'var(--green)' : 'var(--text3)'}">${logged ? 'Registrado' : 'Pendiente'}</span>
              </div>`
            }).join('')
        }
      </div>

      <!-- RANKING SEMANAL -->
      <div class="card" style="padding:14px">
        <div class="card-title" style="margin-bottom:10px"><i class="ti ti-trophy"></i> Ranking 7 días</div>
        ${avgScores.length === 0
          ? '<div style="font-size:12px;color:var(--text3)">Sin datos de la semana</div>'
          : avgScores.map((c, i) => `
              <div style="padding:6px 0;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                  <span style="font-size:12px;color:var(--text3);width:16px;text-align:right">${i + 1}</span>
                  <span style="font-size:13px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(c.name)}</span>
                  <span style="font-size:13px;font-weight:700;color:${scoreColor(c.avg)}">${c.avg}%</span>
                </div>
                ${scoreBar(c.avg)}
              </div>`
          ).join('')
        }
      </div>
    </div>

    <!-- CLIENTES SIN REGISTRAR HOY -->
    ${atRisk.length > 0 ? `
    <div class="card" style="border-color:var(--amber)44;margin-bottom:16px">
      <div class="card-title" style="color:var(--amber)"><i class="ti ti-alert-triangle"></i> Sin registro hoy (${atRisk.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
        ${atRisk.map(c => `<span class="tag" style="border-color:var(--amber)44;color:var(--amber)">${escHtml(c.profiles?.full_name || '—')}</span>`).join('')}
      </div>
    </div>` : `
    <div class="card" style="border-color:var(--green)44;margin-bottom:16px;text-align:center;padding:14px">
      <i class="ti ti-circle-check" style="color:var(--green);font-size:20px"></i>
      <span style="font-size:13px;color:var(--green);font-weight:600;margin-left:8px">Todos los clientes han registrado hoy</span>
    </div>`}

    <!-- EDITAR PERFIL (colapsable) -->
    <div id="profile-edit-section" style="display:none">
      <div class="card">
        <div class="card-title"><i class="ti ti-pencil"></i> Editar perfil</div>
        <div class="form-group">
          <label class="form-label">Nombre completo</label>
          <input type="text" id="tp-name" value="${escHtml(snap.full_name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Especialidad</label>
          <input type="text" id="tp-specialty" value="${escHtml(snap.specialty)}" placeholder="Fuerza y hipertrofia...">
        </div>
        <div class="form-group">
          <label class="form-label">Máximo de clientes activos</label>
          <input type="number" id="tp-max" value="${snap.max_clients}" min="1" max="200">
        </div>
        <div class="form-group">
          <label class="form-label">Bio</label>
          <textarea id="tp-bio" style="min-height:100px">${escHtml(snap.bio)}</textarea>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn" id="tp-discard-btn" onclick="discardMyProfile()" style="flex:1;opacity:.4" disabled>
            <i class="ti ti-arrow-back-up"></i> Descartar
          </button>
          <button class="btn btn-primary" onclick="saveMyProfile()" style="flex:1">
            <i class="ti ti-device-floppy"></i> Guardar
          </button>
        </div>
      </div>
    </div>
  `

  const inputs = ['tp-name', 'tp-specialty', 'tp-max', 'tp-bio']
  inputs.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('input', checkMyProfileDirty)
  })
}

window.toggleProfileEdit = function() {
  const sec = document.getElementById('profile-edit-section')
  if (!sec) return
  const visible = sec.style.display !== 'none'
  sec.style.display = visible ? 'none' : 'block'
  if (!visible) sec.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function checkMyProfileDirty() {
  const snap = TRAINER_PROFILE_SNAPSHOT
  const name = document.getElementById('tp-name')?.value
  const dirty = name !== undefined && (
    name !== snap.full_name ||
    document.getElementById('tp-specialty').value !== snap.specialty ||
    document.getElementById('tp-max').value !== String(snap.max_clients) ||
    document.getElementById('tp-bio').value !== snap.bio
  )
  const btn = document.getElementById('tp-discard-btn')
  if (!btn) return
  btn.disabled = !dirty
  btn.style.opacity = dirty ? '1' : '0.4'
  btn.style.color = dirty ? 'var(--amber)' : 'var(--text2)'
  btn.style.borderColor = dirty ? 'var(--amber)' : 'var(--border2)'
}

window.discardMyProfile = function() {
  const snap = TRAINER_PROFILE_SNAPSHOT
  document.getElementById('tp-name').value = snap.full_name
  document.getElementById('tp-specialty').value = snap.specialty
  document.getElementById('tp-max').value = snap.max_clients
  document.getElementById('tp-bio').value = snap.bio
  checkMyProfileDirty()
  showNotif('Cambios descartados')
}

window.saveMyProfile = async function() {
  const name = document.getElementById('tp-name').value.trim()
  const specialty = document.getElementById('tp-specialty').value.trim()
  const max = parseInt(document.getElementById('tp-max').value) || 20
  const bio = document.getElementById('tp-bio').value.trim()

  if (!name) { showNotif('El nombre no puede estar vacío'); return }

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from('trainers').update({ bio, specialty, max_clients: max }).eq('id', TRAINER_ID),
    supabase.from('profiles').update({ full_name: name }).eq('id', TRAINER_ID),
  ])

  if (e1 || e2) { showNotif('Error al guardar: ' + (e1?.message || e2?.message)); return }

  TRAINER_PROFILE_SNAPSHOT = { full_name: name, bio, specialty, max_clients: max }
  document.getElementById('trainer-name-logo').textContent = name
  checkMyProfileDirty()
  showNotif('Perfil guardado ✓')
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── IMPORTACIÓN MASIVA DE CLIENTES ───────────────────────────────────────────

let IMPORT_ROWS = []

window.openImportModal = function() {
  IMPORT_ROWS = []
  document.getElementById('import-modal').classList.add('open')
  document.getElementById('import-file-view').style.display = 'block'
  document.getElementById('import-preview-view').style.display = 'none'
  document.getElementById('import-progress-view').style.display = 'none'
  document.getElementById('import-file-input').value = ''
  document.getElementById('import-file-error').style.display = 'none'
}

window.closeImportModal = function() {
  document.getElementById('import-modal').classList.remove('open')
}

window.downloadImportTemplate = function() {
  const csv = 'nombre,email,contraseña,edad,altura_cm,peso_actual,peso_objetivo,kcal_objetivo,proteina_objetivo,notas,semanas\nJuan García,juan@email.com,Pass1234,35,175,85,75,2500,175,"Sin lesiones conocidas",12'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'plantilla_clientes.csv'
  a.click()
}

window.handleImportFile = async function(e) {
  const file = e.target.files[0]
  if (!file) return
  const errEl = document.getElementById('import-file-error')
  errEl.style.display = 'none'

  try {
    let rows
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      rows = await parseExcel(file)
    } else {
      rows = await parseCsv(file)
    }

    if (!rows || rows.length === 0) {
      errEl.textContent = 'El archivo está vacío o no tiene el formato correcto.'
      errEl.style.display = 'block'
      return
    }

    IMPORT_ROWS = rows
    renderImportPreview(rows)
  } catch (err) {
    errEl.textContent = 'Error al leer el archivo: ' + err.message
    errEl.style.display = 'block'
  }
}

async function parseCsv(file) {
  const text = await file.text()
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-záéíóúñ_]/g, ''))
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim() })
    return normalizeRow(obj)
  }).filter(r => r.email && r.nombre)
}

function splitCsvLine(line) {
  const result = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuote = !inQuote }
    else if (ch === ',' && !inQuote) { result.push(cur); cur = '' }
    else { cur += ch }
  }
  result.push(cur)
  return result
}

async function parseExcel(file) {
  if (!window.XLSX) {
    await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' })
  return data.map(row => {
    const norm = {}
    Object.entries(row).forEach(([k, v]) => { norm[k.toLowerCase().trim()] = String(v).trim() })
    return normalizeRow(norm)
  }).filter(r => r.email && r.nombre)
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel'))
    document.head.appendChild(s)
  })
}

function normalizeRow(obj) {
  const get = (...keys) => { for (const k of keys) { if (obj[k] != null && obj[k] !== '') return obj[k] } return '' }
  return {
    nombre:    get('nombre', 'name', 'full_name', 'nombre completo'),
    email:     get('email', 'correo', 'e-mail'),
    password:  get('contraseña', 'contrasena', 'password', 'pass', 'clave') || autoPass(),
    age:       parseInt(get('edad', 'age')) || '',
    height_cm: parseInt(get('altura_cm', 'altura', 'height_cm', 'height')) || '',
    weight:    parseFloat(get('peso_actual', 'peso', 'weight', 'weight_kg')) || '',
    weight_goal: get('peso_objetivo', 'weight_goal', 'objetivo peso'),
    kcal:      parseInt(get('kcal_objetivo', 'kcal', 'calorias', 'calories')) || '',
    protein:   parseInt(get('proteina_objetivo', 'proteina', 'protein', 'proteína')) || '',
    notes:     get('notas', 'notes', 'observaciones', 'lesiones'),
    weeks:     parseInt(get('semanas', 'weeks', 'plan_weeks', 'duración')) || 12,
  }
}

function autoPass() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.floor(Math.random() * 90 + 10)
}

function renderImportPreview(rows) {
  document.getElementById('import-file-view').style.display = 'none'
  document.getElementById('import-preview-view').style.display = 'block'

  const cols = ['nombre', 'email', 'contraseña', 'edad', 'kg', 'kcal', 'sem']
  const html = `
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
      Se encontraron <strong style="color:var(--text)">${rows.length} clientes</strong> listos para importar.
      Las contraseñas auto-generadas aparecen marcadas — guárdalas o cámbialas.
    </div>
    <div style="overflow-x:auto;margin-bottom:14px;max-height:320px;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            ${['Nombre','Email','Contraseña','Edad','Peso','Kcal','Sem.'].map(h =>
              `<th style="text-align:left;padding:6px 8px;color:var(--text2);font-weight:600;white-space:nowrap">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr style="border-bottom:1px solid var(--border);${i % 2 === 0 ? 'background:var(--bg3)' : ''}">
              <td style="padding:6px 8px;white-space:nowrap">${escHtml(r.nombre)}</td>
              <td style="padding:6px 8px;color:var(--text2)">${escHtml(r.email)}</td>
              <td style="padding:6px 8px"><span class="tag" style="font-family:monospace;font-size:11px">${escHtml(r.password)}</span></td>
              <td style="padding:6px 8px;color:var(--text2)">${r.age || '—'}</td>
              <td style="padding:6px 8px;color:var(--text2)">${r.weight || '—'}</td>
              <td style="padding:6px 8px;color:var(--text2)">${r.kcal || '—'}</td>
              <td style="padding:6px 8px;color:var(--text2)">${r.weeks}</td>
            </tr>`
          ).join('')}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn" onclick="document.getElementById('import-file-view').style.display='block';document.getElementById('import-preview-view').style.display='none'" style="flex:1">
        <i class="ti ti-arrow-left"></i> Cambiar archivo
      </button>
      <button class="btn btn-primary" onclick="runBulkImport()" style="flex:2">
        <i class="ti ti-user-plus"></i> Importar ${rows.length} clientes
      </button>
    </div>
  `
  document.getElementById('import-preview-view').innerHTML = html
}

window.runBulkImport = async function() {
  const rows = IMPORT_ROWS
  if (!rows.length) return

  document.getElementById('import-preview-view').style.display = 'none'
  document.getElementById('import-progress-view').style.display = 'block'

  const results = []
  const { data: { session: trainerSession } } = await supabase.auth.getSession()

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    updateImportProgress(i + 1, rows.length, r.nombre)

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: r.email,
        password: r.password,
        options: { data: { role: 'client', full_name: r.nombre } }
      })

      await supabase.auth.setSession({
        access_token: trainerSession.access_token,
        refresh_token: trainerSession.refresh_token
      })

      if (signUpError) { results.push({ nombre: r.nombre, ok: false, msg: signUpError.message }); continue }
      if (!data.user) { results.push({ nombre: r.nombre, ok: false, msg: 'No se creó el usuario' }); continue }

      await supabase.from('profiles').upsert({ id: data.user.id, role: 'client', full_name: r.nombre, email: r.email })
      const { error: clientErr } = await supabase.from('clients').upsert({
        id: data.user.id,
        trainer_id: TRAINER_ID,
        age: r.age || null,
        height_cm: r.height_cm || null,
        weight_start: r.weight || null,
        weight_goal: r.weight_goal || null,
        kcal_goal: r.kcal || null,
        protein_goal: r.protein || null,
        notes: r.notes || null,
        plan_weeks: r.weeks,
        plan_start_date: new Date().toISOString().split('T')[0],
      })

      if (clientErr) { results.push({ nombre: r.nombre, ok: false, msg: clientErr.message }); continue }
      results.push({ nombre: r.nombre, ok: true, email: r.email, password: r.password })
    } catch (err) {
      await supabase.auth.setSession({ access_token: trainerSession.access_token, refresh_token: trainerSession.refresh_token })
      results.push({ nombre: r.nombre, ok: false, msg: err.message })
    }
  }

  await loadClients()
  renderImportResults(results)
}

function updateImportProgress(done, total, name) {
  const pct = Math.round((done / total) * 100)
  document.getElementById('import-progress-view').innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:14px;font-weight:600;margin-bottom:16px">Importando clientes...</div>
      <div style="font-size:24px;font-weight:800;color:var(--blue);margin-bottom:4px">${done} / ${total}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:16px">${escHtml(name)}</div>
      <div class="prog-wrap"><div class="prog-fill" style="width:${pct}%;background:var(--blue)"></div></div>
    </div>
  `
}

function renderImportResults(results) {
  const ok = results.filter(r => r.ok)
  const fail = results.filter(r => !r.ok)
  document.getElementById('import-progress-view').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <i class="ti ti-circle-check" style="font-size:32px;color:var(--green);display:block;margin-bottom:8px"></i>
      <div style="font-size:15px;font-weight:700">${ok.length} clientes importados</div>
      ${fail.length ? `<div style="font-size:12px;color:var(--red);margin-top:4px">${fail.length} errores</div>` : ''}
    </div>
    ${ok.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;font-weight:600">IMPORTADOS CORRECTAMENTE</div>
      <div style="max-height:200px;overflow-y:auto">
        ${ok.map(r => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
            <span>${escHtml(r.nombre)}</span>
            <span style="color:var(--text2);font-family:monospace">${escHtml(r.password)}</span>
          </div>`).join('')}
      </div>
      <button class="btn" onclick="downloadImportResults(${JSON.stringify(ok).replace(/</g,'\\u003c')})" style="width:100%;margin-top:10px;font-size:12px">
        <i class="ti ti-download"></i> Descargar contraseñas temporales
      </button>
    </div>` : ''}
    ${fail.length ? `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--red);margin-bottom:6px;font-weight:600">ERRORES</div>
      ${fail.map(r => `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--red)">${escHtml(r.nombre)}</span> — ${escHtml(r.msg)}</div>`).join('')}
    </div>` : ''}
    <button class="btn btn-primary" onclick="closeImportModal()" style="width:100%">Cerrar</button>
  `
}

window.downloadImportResults = function(rows) {
  const csv = 'nombre,email,contraseña_temporal\n' + rows.map(r => `${r.nombre},${r.email},${r.password}`).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'credenciales_importados.csv'
  a.click()
}

// ─── VOZ E INSTRUCCIONES ──────────────────────────────────────────────────────

function voiceMicBtn(targetId) {
  return `<button class="btn" onclick="startVoice('${targetId}', this)" title="Dictar por voz" style="padding:8px 10px;flex-shrink:0"><i class="ti ti-microphone"></i></button>`
}

function notesCard(fieldId, value, saveFn, icon, label) {
  return `
  <div class="card" style="margin-bottom:12px">
    <div class="card-title"><i class="ti ${icon}"></i> ${label}</div>
    <div style="display:flex;gap:8px;align-items:flex-start">
      <textarea id="${fieldId}" style="flex:1;min-height:72px;resize:vertical" placeholder="Escribe o dicta las instrucciones para tu cliente...">${escHtml(value || '')}</textarea>
      ${voiceMicBtn(fieldId)}
    </div>
    <button class="btn btn-primary" onclick="${saveFn}()" style="margin-top:8px;font-size:12px;padding:7px 14px">
      <i class="ti ti-device-floppy"></i> Guardar instrucciones
    </button>
  </div>`
}

window.startVoice = function(targetId, btn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { showNotif('Tu navegador no soporta dictado por voz (usa Chrome)'); return }
  const r = new SR()
  r.lang = 'es-ES'
  r.continuous = false
  r.interimResults = false

  const reset = () => {
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = '<i class="ti ti-microphone"></i>'
  }
  btn.style.color = 'var(--red)'
  btn.style.borderColor = 'var(--red)'
  btn.innerHTML = '<i class="ti ti-microphone" style="animation:pulse 1s infinite"></i>'

  r.onresult = e => {
    const text = e.results[0][0].transcript
    const el = document.getElementById(targetId)
    if (el) el.value = (el.value ? el.value + ' ' : '') + text
    reset()
  }
  r.onerror = reset
  r.onend = reset
  r.start()
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
