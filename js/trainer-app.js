import { supabase } from './supabase-client.js'
import { requireRole, logout } from './auth.js'
import { SUPL_TIMINGS, CARDIO_TYPE_META } from './constants.js'

const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
const MEAL_ICONS = ['ti-coffee','ti-soup','ti-apple','ti-moon','ti-salad','ti-bread']


let TRAINER_ID = null
let TRAINER_NAME = ''
let ALL_CLIENTS = []
let TODAY_LOGS = {}
let CURRENT_FILTER = 'all'
let CURRENT_LABEL_FILTER = null
let SELECTED_CLIENT = null
let SELECTED_CLIENT_DATA = null
let CURRENT_RESUMEN_MSG = ''
let ACTIVE_TAB = 'profile'
let ACTIVE_DAY = 0
let ACTIVE_DIET_DAY = 0
let ACTIVE_MEAL_ID = null
let EDITING_EX_ID = null
let SUBSCRIPTION_STATUS = 'trial'
let PLAN_TIER = null

const TIER_LIMITS = { starter: 10, pro: 30, elite: 75, studio: 9999 }
const TIER_LABELS = { starter: 'Starter', pro: 'Pro', elite: 'Elite', studio: 'Studio' }
const TIER_PRICES = { starter: '€29', pro: '€59', elite: '€99', studio: '€149' }
const TIER_MAX    = { starter: '10 clientes', pro: '30 clientes', elite: '75 clientes', studio: 'Ilimitado' }

const LABEL_COLORS = ['#00d2ff','#1D9E75','#BA7517','#E24B4A','#9B59B6','#E67E22','#27AE60','#2980B9']
function labelColor(str) {
  if (!str) return '#555'
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xFFFF
  return LABEL_COLORS[h % LABEL_COLORS.length]
}
function avatarColor(str) {
  const colors = ['#E85454','#E89A54','#54B4E8','#1D9E75','#9B59B6','#E854B6','#00d2ff','#BA7517']
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xFFFF
  return colors[h % colors.length]
}
function relativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return 'Ayer'
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await requireRole('trainer')
    if (!auth) return
    TRAINER_ID = auth.session.user.id
    TRAINER_NAME = (auth.profile.full_name || auth.session.user.email).split(' ')[0]
    const fullName = auth.profile.full_name || auth.session.user.email
    document.getElementById('trainer-name-logo').textContent = fullName
    const mName = document.getElementById('mobile-trainer-name')
    if (mName) mName.textContent = fullName

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
  } catch (err) {
    console.error('Error al inicializar portal:', err)
    document.getElementById('loading-screen').style.display = 'none'
    document.getElementById('app').style.display = 'flex'
  }
})

window.doLogout = logout

// ─── SUSCRIPCIÓN ──────────────────────────────────────────────────────────────

async function loadSubscriptionStatus() {
  const { data } = await supabase
    .from('trainers')
    .select('subscription_status, trial_ends_at, plan_tier')
    .eq('id', TRAINER_ID)
    .single()

  if (!data) return

  SUBSCRIPTION_STATUS = data.subscription_status || 'trial'
  PLAN_TIER = data.plan_tier || null
  const trialEnds = data.trial_ends_at ? new Date(data.trial_ends_at) : null
  const now = new Date()
  const trialExpired = trialEnds && trialEnds < now

  if (SUBSCRIPTION_STATUS === 'active') {
    // Banner solo si está cerca del límite de clientes
    if (PLAN_TIER && PLAN_TIER !== 'studio') {
      const limit = TIER_LIMITS[PLAN_TIER] || 30
      const activeCount = ALL_CLIENTS.filter(c => c.active !== false).length
      if (activeCount >= limit * 0.9) showSubscriptionBanner('near_limit', 0, PLAN_TIER, activeCount, limit)
    }
  } else if (SUBSCRIPTION_STATUS === 'trial' && !trialExpired) {
    const daysLeft = trialEnds ? Math.ceil((trialEnds - now) / 86400000) : 14
    showSubscriptionBanner('trial', daysLeft)
  } else if (SUBSCRIPTION_STATUS === 'past_due') {
    showSubscriptionBanner('past_due')
  } else if (SUBSCRIPTION_STATUS === 'canceled' || SUBSCRIPTION_STATUS === 'unpaid' || (SUBSCRIPTION_STATUS === 'trial' && trialExpired)) {
    SUBSCRIPTION_STATUS = 'expired'
    showPaywall()
  }
}

function showSubscriptionBanner(type, daysLeft = 0, tier = null, activeCount = 0, limit = 0) {
  const sidebar = document.querySelector('.nav-sidebar')
  const existing = document.getElementById('sub-banner')
  if (existing) existing.remove()
  if (!sidebar) return

  const banner = document.createElement('div')
  banner.id = 'sub-banner'
  banner.style.margin = '0 8px 8px'

  if (type === 'trial') {
    banner.style.cssText += 'background:#1D9E7522;border:1px solid #1D9E7544;border-radius:8px;padding:10px 12px;font-size:12px'
    banner.innerHTML = `<div style="color:#6fcfa8;font-weight:600;margin-bottom:4px">Prueba gratuita · ${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}</div>
      <div style="color:var(--text2);margin-bottom:8px">Elige tu plan al finalizar</div>
      <button onclick="showPaywall()" class="btn btn-primary" style="width:100%;font-size:12px;padding:7px">Ver planes</button>`
  } else if (type === 'past_due') {
    banner.style.cssText += 'background:#BA751722;border:1px solid #BA751744;border-radius:8px;padding:10px 12px;font-size:12px'
    banner.innerHTML = `<div style="color:#e8a83e;font-weight:600;margin-bottom:4px">Pago fallido</div>
      <div style="color:var(--text2);margin-bottom:8px">Actualiza tu método de pago</div>
      <button onclick="startCheckout('${PLAN_TIER || 'pro'}')" class="btn" style="width:100%;font-size:12px;padding:7px;border-color:#BA7517;color:#e8a83e">Actualizar pago</button>`
  } else if (type === 'near_limit') {
    banner.style.cssText += 'background:#378ADD22;border:1px solid #378ADD44;border-radius:8px;padding:10px 12px;font-size:12px'
    banner.innerHTML = `<div style="color:var(--blue);font-weight:600;margin-bottom:4px">Plan ${TIER_LABELS[tier]} · ${activeCount}/${limit} clientes</div>
      <div style="color:var(--text2);margin-bottom:8px">Cerca del límite</div>
      <button onclick="showPaywall()" class="btn" style="width:100%;font-size:12px;padding:7px;border-color:var(--blue);color:var(--blue)">Ampliar plan</button>`
  }

  const navBottom = sidebar.querySelector('.nav-bottom')
  if (navBottom) sidebar.insertBefore(banner, navBottom)
  else sidebar.appendChild(banner)
}

function showPaywall() {
  const existing = document.getElementById('paywall-overlay')
  if (existing) existing.remove()

  const tierCard = (id, highlighted = false) => `
    <div onclick="selectPaywallTier('${id}')" id="tier-card-${id}" style="cursor:pointer;padding:16px;border-radius:12px;border:2px solid ${highlighted ? 'var(--blue)' : 'rgba(255,255,255,0.12)'};background:${highlighted ? 'rgba(55,138,221,0.12)' : 'rgba(255,255,255,0.04)'};transition:all .15s;position:relative">
      ${highlighted ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--blue);color:#0c0c0c;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;white-space:nowrap">MÁS POPULAR</div>' : ''}
      <div style="font-size:18px;font-weight:800;color:${highlighted ? 'var(--blue)' : '#fff'}">${TIER_LABELS[id]}</div>
      <div style="font-size:24px;font-weight:700;margin:4px 0">${TIER_PRICES[id]}<span style="font-size:13px;font-weight:400;opacity:.6">/mes</span></div>
      <div style="font-size:12px;color:var(--text2)">${TIER_MAX[id]}</div>
    </div>`

  const overlay = document.createElement('div')
  overlay.id = 'paywall-overlay'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)'
  overlay.innerHTML = `
    <div style="background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:32px;max-width:560px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,0.6)">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:28px;font-weight:800;margin-bottom:8px">Elige tu plan</div>
        <div style="font-size:14px;color:var(--text2)">Tu periodo de prueba ha finalizado. Elige el plan que mejor se adapta a tu negocio.</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${tierCard('starter')}
        ${tierCard('pro', true)}
        ${tierCard('elite')}
      </div>
      <div id="paywall-selected" style="display:none;margin-bottom:16px;padding:12px;background:rgba(55,138,221,0.1);border:1px solid rgba(55,138,221,0.3);border-radius:10px;font-size:13px;color:var(--text2)">
        Plan seleccionado: <strong id="paywall-tier-name" style="color:var(--blue)"></strong>
      </div>
      <button id="paywall-cta" onclick="confirmPaywallCheckout()" class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;font-weight:700" disabled>
        Continuar con el pago
      </button>
      <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--text3)">
        Puedes cancelar en cualquier momento · Sin permanencia
      </div>
    </div>`

  document.body.appendChild(overlay)
}

let _paywallTier = null
window.selectPaywallTier = function(tier) {
  _paywallTier = tier
  document.querySelectorAll('[id^="tier-card-"]').forEach(el => {
    const t = el.id.replace('tier-card-', '')
    el.style.borderColor = t === tier ? 'var(--blue)' : 'rgba(255,255,255,0.12)'
    el.style.background   = t === tier ? 'rgba(55,138,221,0.12)' : 'rgba(255,255,255,0.04)'
  })
  const sel = document.getElementById('paywall-selected')
  const name = document.getElementById('paywall-tier-name')
  const cta  = document.getElementById('paywall-cta')
  if (sel && name && cta) {
    sel.style.display = 'block'
    name.textContent = `${TIER_LABELS[tier]} · ${TIER_PRICES[tier]}/mes · ${TIER_MAX[tier]}`
    cta.disabled = false
  }
}

window.confirmPaywallCheckout = async function() {
  if (!_paywallTier) return
  const btn = document.getElementById('paywall-cta')
  if (btn) { btn.disabled = true; btn.textContent = 'Redirigiendo a pago...' }
  await startCheckout(_paywallTier)
}

window.startCheckout = async function(tier = null) {
  const selectedTier = tier || PLAN_TIER || 'pro'
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${supabase.supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      tier: selectedTier,
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
  img.src = url; img.style.display = 'block'
  document.getElementById('trainer-logo-icon').style.display = 'none'
  // Mobile header logo
  const mImg = document.getElementById('mobile-logo-img')
  const mIcon = document.getElementById('mobile-logo-icon')
  if (mImg) { mImg.src = url; mImg.style.display = 'block' }
  if (mIcon) mIcon.style.display = 'none'
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
    .select('id, active, weight_goal, plan_weeks, goal_label, profiles(full_name, email)')
    .eq('trainer_id', TRAINER_ID)
    .order('active', { ascending: false })
  ALL_CLIENTS = data || []

  const today = new Date().toISOString().split('T')[0]
  const ids = ALL_CLIENTS.map(c => c.id)
  if (ids.length) {
    const { data: logs } = await supabase
      .from('daily_logs')
      .select('client_id, score, score_training, score_nutrition, score_cardio, created_at')
      .in('client_id', ids)
      .eq('log_date', today)
    TODAY_LOGS = {}
    ;(logs || []).forEach(l => { TODAY_LOGS[l.client_id] = l })
  }

  renderNavBadges()
  renderNavLabels()
  applyCurrentFilter()

  if (!ALL_CLIENTS.length) {
    showWelcomeScreen()
  } else {
    openMyProfile()
  }
}

function showWelcomeScreen() {
  const main = document.getElementById('main-content')
  main.innerHTML = `
    <div style="max-width:520px;margin:60px auto;padding:0 24px;text-align:center">
      <div style="font-size:48px;margin-bottom:20px">🎉</div>
      <h2 style="font-size:22px;font-weight:700;margin-bottom:10px;letter-spacing:-.02em">¡Bienvenido a Tu Preparador!</h2>
      <p style="color:var(--text2);font-size:14px;line-height:1.6;margin-bottom:32px">
        Todo listo para empezar. En menos de 5 minutos puedes tener a tu primer cliente registrado y viendo su plan desde el móvil.
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;text-align:left;margin-bottom:32px">
        <div class="card" style="padding:16px;display:flex;gap:14px;align-items:flex-start">
          <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0c0c0c">1</div>
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:3px">Añade tu primer cliente</div>
            <div style="font-size:12px;color:var(--text3)">Pulsa el botón <strong style="color:var(--text2)">+ Nuevo cliente</strong> en la barra lateral y rellena sus datos básicos.</div>
          </div>
        </div>
        <div class="card" style="padding:16px;display:flex;gap:14px;align-items:flex-start">
          <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text3)">2</div>
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:3px;color:var(--text2)">Asigna un plan de entreno y dieta</div>
            <div style="font-size:12px;color:var(--text3)">Desde las pestañas Entreno y Nutrición diseña su plan. Usa el editor de IA para ir más rápido.</div>
          </div>
        </div>
        <div class="card" style="padding:16px;display:flex;gap:14px;align-items:flex-start">
          <div style="width:28px;height:28px;min-width:28px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text3)">3</div>
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:3px;color:var(--text2)">Invita al cliente a la app</div>
            <div style="font-size:12px;color:var(--text3)">El cliente recibirá un email con su acceso al portal móvil donde verá su plan y registrará su progreso cada día.</div>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" onclick="openNewClientModal()" style="padding:12px 28px;font-size:15px">
        <i class="ti ti-user-plus"></i> Añadir primer cliente
      </button>

      <p style="margin-top:20px;font-size:12px;color:var(--text3)">
        ¿Tienes varios clientes? Usa la importación masiva desde CSV/Excel en el botón <i class="ti ti-upload" style="font-size:11px"></i> de la barra lateral.
      </p>
    </div>
  `
}

function renderClientList(clients) {
  const el = document.getElementById('client-list')
  if (!clients.length) {
    el.innerHTML = `
      <div style="padding:20px 16px;text-align:center">
        <div style="font-size:13px;color:var(--text3);margin-bottom:12px">Aún no tienes clientes</div>
        <button class="btn btn-primary" style="width:100%;font-size:13px" onclick="openNewClientModal()">
          <i class="ti ti-user-plus"></i> Añadir cliente
        </button>
      </div>`
    return
  }
  el.innerHTML = clients.map(c => {
    const name = c.profiles?.full_name || c.profiles?.email || '—'
    const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    const selected = SELECTED_CLIENT === c.id
    const log = TODAY_LOGS[c.id]
    const score = log?.score ?? null
    const scoreColor = score === null ? '' : score >= 80 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'

    let statusText = 'Sin registro hoy'
    let statusColor = 'rgba(255,255,255,0.25)'
    let statusIcon = '<i class="ti ti-alert-circle" style="font-size:10px;color:#BA7517"></i>'
    if (log) {
      const st = log.score_training || 0, sn = log.score_nutrition || 0, sc = log.score_cardio || 0
      if (st >= 90 && sn >= 90 && sc >= 60) {
        statusText = `Todo completado · Score ${score}%`; statusColor = '#1D9E75'; statusIcon = ''
      } else if (sc < 30 && (st > 0 || sn > 0)) {
        statusText = `Sin cardio hoy · Score ${score}%`; statusColor = 'rgba(255,255,255,0.4)'; statusIcon = ''
      } else if (st >= 70) {
        statusText = `Entreno completado · Score ${score}%`; statusColor = 'rgba(255,255,255,0.4)'; statusIcon = ''
      } else {
        statusText = `Nutrición ${sn}% · Score ${score}%`; statusColor = 'rgba(255,255,255,0.4)'; statusIcon = ''
      }
    }

    const timeStr = log ? relativeTime(log.created_at) : (c.active === false ? 'Archivado' : '')

    return `<div class="cr${selected ? ' selected' : ''}" onclick="selectClient('${c.id}')">
      <div class="cr-avatar" style="background:${avatarColor(name)}">${initials}</div>
      <div class="cr-body">
        <div class="cr-name">${name}</div>
        <div class="cr-status" style="color:${statusColor}">${statusIcon}${statusText}</div>
        ${score !== null ? `<div class="cr-bar"><div class="cr-bar-fill" style="width:${score}%;background:${scoreColor}"></div></div>` : ''}
      </div>
      <div class="cr-time">${timeStr}</div>
    </div>`
  }).join('')
}

function applyCurrentFilter() {
  let list = ALL_CLIENTS
  if (CURRENT_FILTER === 'active') list = list.filter(c => c.active !== false)
  else if (CURRENT_FILTER === 'archived') list = list.filter(c => c.active === false)
  else if (CURRENT_FILTER === 'noreg') list = list.filter(c => !TODAY_LOGS[c.id] && c.active !== false)
  if (CURRENT_LABEL_FILTER) list = list.filter(c => c.goal_label === CURRENT_LABEL_FILTER)
  renderClientList(list)
}

window.setFilter = function(filter) {
  CURRENT_FILTER = filter
  CURRENT_LABEL_FILTER = null
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'))
  const idMap = { all: 'nav-all', active: 'nav-active', noreg: 'nav-noreg', archived: 'nav-archived' }
  const el = document.getElementById(idMap[filter])
  if (el) el.classList.add('active')
  document.querySelectorAll('.nav-label-item').forEach(el => el.classList.remove('active'))
  applyCurrentFilter()
}

window.setLabelFilter = function(label) {
  CURRENT_LABEL_FILTER = label
  CURRENT_FILTER = 'all'
  document.querySelectorAll('.nav-item[id^="nav-"]').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.nav-label-item').forEach(el => {
    el.classList.toggle('active', el.dataset.label === label)
  })
  applyCurrentFilter()
}

function renderNavBadges() {
  const total = ALL_CLIENTS.length
  const active = ALL_CLIENTS.filter(c => c.active !== false).length
  const noreg = ALL_CLIENTS.filter(c => !TODAY_LOGS[c.id] && c.active !== false).length
  const set = (id, val, hide0) => {
    const el = document.getElementById(id)
    if (!el) return
    el.textContent = val || ''
    if (hide0) el.style.display = val ? '' : 'none'
  }
  // Desktop
  set('nav-count-all', total)
  set('nav-count-active', active)
  set('nav-count-noreg', noreg, true)
  // Mobile
  set('mnav-count-all', total)
  set('mnav-count-active', active)
  set('mnav-count-noreg', noreg, true)
  // Show mobile search
  const ms = document.getElementById('mobile-search')
  if (ms) ms.style.display = window.innerWidth <= 640 ? 'block' : 'none'
}

window.setFilterMobile = function(filter) {
  CURRENT_FILTER = filter
  CURRENT_LABEL_FILTER = null
  // Desktop nav
  const idMap = { all: 'nav-all', active: 'nav-active', noreg: 'nav-noreg', archived: 'nav-archived' }
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'))
  const dEl = document.getElementById(idMap[filter])
  if (dEl) dEl.classList.add('active')
  // Mobile nav
  document.querySelectorAll('.mnav-tab').forEach(el => el.classList.remove('active'))
  const mEl = document.getElementById('mnav-' + filter)
  if (mEl) mEl.classList.add('active')
  applyCurrentFilter()
}

function renderNavLabels() {
  const el = document.getElementById('nav-labels')
  if (!el) return
  const labels = [...new Set(ALL_CLIENTS.map(c => c.goal_label).filter(Boolean))]
  if (!labels.length) { el.innerHTML = '<div style="padding:4px 18px;font-size:11px;color:rgba(255,255,255,0.2)">Sin etiquetas</div>'; return }
  el.innerHTML = labels.map(l => `
    <div class="nav-label-item" data-label="${l}" onclick="setLabelFilter('${l}')">
      <div class="nav-label-dot" style="background:${labelColor(l)}"></div>
      ${l}
    </div>`).join('')
}

window.filterClients = function(q) {
  const lq = q.toLowerCase()
  let list = ALL_CLIENTS
  if (CURRENT_FILTER === 'active') list = list.filter(c => c.active !== false)
  else if (CURRENT_FILTER === 'archived') list = list.filter(c => c.active === false)
  else if (CURRENT_FILTER === 'noreg') list = list.filter(c => !TODAY_LOGS[c.id] && c.active !== false)
  if (CURRENT_LABEL_FILTER) list = list.filter(c => c.goal_label === CURRENT_LABEL_FILTER)
  if (lq) list = list.filter(c =>
    (c.profiles?.full_name || '').toLowerCase().includes(lq) ||
    (c.profiles?.email || '').toLowerCase().includes(lq)
  )
  renderClientList(list)
}

window.selectClient = async function(clientId) {
  SELECTED_CLIENT = clientId
  const profileBtn = document.getElementById('my-profile-btn')
  if (profileBtn) profileBtn.classList.remove('active')
  applyCurrentFilter()
  // Mobile: switch to detail view
  if (window.innerWidth <= 640) {
    document.body.classList.add('mobile-detail')
    document.querySelector('.main').style.display = 'block'
  }
  await loadClientDetail(clientId)
  // Show back button on mobile after render
  if (window.innerWidth <= 640) {
    const backBtn = document.getElementById('mobile-back-btn')
    if (backBtn) backBtn.style.display = 'inline-flex'
  }
}

window.mobileBackToList = function() {
  document.body.classList.remove('mobile-detail')
  document.querySelector('.main').style.display = ''
  SELECTED_CLIENT = null
  applyCurrentFilter()
  const ms = document.getElementById('mobile-search')
  if (ms) ms.style.display = 'block'
}

async function loadClientDetail(clientId) {
  const main = document.getElementById('main-content')
  main.innerHTML = '<div class="loading"><div class="spinner"></div>Cargando...</div>'

  const today = new Date().toISOString().split('T')[0]
  const [{ data: client }, { data: woData }, { data: dietData }, { data: supls }, { data: todayLog }] = await Promise.all([
    supabase.from('clients').select('*, profiles(full_name, email)').eq('id', clientId).single(),
    supabase.from('workout_days').select('*, workout_exercises(*)').eq('client_id', clientId).order('day_index'),
    supabase.from('diet_plans').select('*, diet_meals(*, diet_foods(*))').eq('client_id', clientId).eq('active', true).single(),
    supabase.from('supplements').select('*').eq('client_id', clientId).order('order_index'),
    supabase.from('daily_logs').select('*').eq('client_id', clientId).eq('log_date', today).maybeSingle(),
  ])

  SELECTED_CLIENT_DATA = { client, workouts: woData || [], diet: dietData, supplements: supls || [], todayLog: todayLog || null }
  if (todayLog) TODAY_LOGS[clientId] = todayLog
  if (dietData?.diet_meals) {
    dietData.diet_meals.sort((a, b) => a.order_index - b.order_index)
    dietData.diet_meals.forEach(m => m.diet_foods.sort((a, b) => a.order_index - b.order_index))
  }

  renderClientDetail()
}

function renderClientDetail() {
  const { client, todayLog } = SELECTED_CLIENT_DATA
  const name = client.profiles?.full_name || client.profiles?.email || '—'
  const firstName = name.split(' ')[0]
  const initials = name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
  const color = avatarColor(name)
  const log = todayLog || TODAY_LOGS[SELECTED_CLIENT] || null

  // Client status line
  const isActive = client.active !== false
  const logTime = log?.created_at
    ? new Date(log.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
    : null
  const statusSub = isActive
    ? (logTime ? `Activo · Hoy ${logTime}` : 'Activo · Sin registro hoy')
    : 'Inactivo'

  // Label badge
  const lc = client.goal_label ? labelColor(client.goal_label) : null
  const labelHtml = lc
    ? `<div class="cia-label" style="background:${lc}18;border:1px solid ${lc}40;color:${lc}">${escHtml(client.goal_label)}</div>`
    : ''

  // Generate day summary text
  const { summaryLine, msgBody } = buildDayResumen(client, log)
  CURRENT_RESUMEN_MSG = msgBody

  const score = log ? (log.score || 0) : 0
  const st = log ? Math.round(log.score_training || 0) : 0
  const sn = log ? Math.round(log.score_nutrition || 0) : 0
  const steps = log ? (log.steps || 0) : 0
  const stepsGoal = client.steps_goal || 10000
  const stepsPct = Math.min(Math.round(steps / stepsGoal * 100), 100)
  const stepsStr = steps > 0 ? `${steps.toLocaleString('es-ES')}/${(stepsGoal/1000).toFixed(0)}k` : '—'

  const scoreColor = score >= 80 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'
  const barColor = pct => pct >= 80 ? '#1D9E75' : pct >= 50 ? '#BA7517' : '#E24B4A'

  document.getElementById('main-content').innerHTML = `
    <div class="detail-topbar">
      <span class="d-btn" id="mobile-back-btn" onclick="mobileBackToList()" title="Volver" style="display:none"><i class="ti ti-arrow-left"></i></span>
      <span class="d-btn" onclick="loadClientDetail('${client.id}')" title="Actualizar"><i class="ti ti-refresh"></i></span>
      <span class="d-btn" onclick="switchTab('profile')" title="Editar perfil"><i class="ti ti-pencil"></i></span>
      <span class="d-btn" onclick="switchTab('measures')" title="Medidas"><i class="ti ti-ruler-measure"></i></span>
      <span class="d-btn red" onclick="if(confirm('¿Archivar este cliente?'))toggleClientActive(false)" title="Archivar"><i class="ti ti-archive"></i></span>
      <span class="d-btn-spacer"></span>
      <span class="d-btn" title="Más opciones"><i class="ti ti-dots"></i></span>
    </div>

    <div class="resumen-wrap">
      <div class="rs-card">
        <!-- Cabecera: avatar + nombre + score -->
        <div class="rs-header">
          <div class="cia-av" style="background:${color}">${initials}</div>
          <div style="min-width:0">
            <div class="cia-name">${escHtml(firstName)}</div>
            <div class="cia-sub">${statusSub}</div>
          </div>
          ${labelHtml}
          <div class="rs-score-ring">
            <span class="rs-score-num" style="color:${scoreColor}">${log ? score + '%' : '—'}</span>
            <span class="rs-score-lbl">hoy</span>
          </div>
        </div>

        <!-- Barras de métricas -->
        <div class="rs-bars">
          <div class="rs-bar-row">
            <i class="ti ti-barbell"></i>
            <div class="rs-bar-track"><div class="rs-bar-fill" style="width:${st}%;background:${barColor(st)}"></div></div>
            <div class="rs-bar-val" style="color:${barColor(st)}">${st}%</div>
          </div>
          <div class="rs-bar-row">
            <i class="ti ti-apple"></i>
            <div class="rs-bar-track"><div class="rs-bar-fill" style="width:${sn}%;background:${barColor(sn)}"></div></div>
            <div class="rs-bar-val" style="color:${barColor(sn)}">${sn}%</div>
          </div>
          <div class="rs-bar-row">
            <i class="ti ti-run"></i>
            <div class="rs-bar-track"><div class="rs-bar-fill" style="width:${stepsPct}%;background:${barColor(stepsPct)}"></div></div>
            <div class="rs-bar-val" style="color:${barColor(stepsPct)}">${stepsStr}</div>
          </div>
        </div>

        <!-- Nota resumen (1-2 líneas) -->
        <div class="rs-note">${escHtml(summaryLine)}</div>

        <!-- Botón enviar -->
        <button class="rs-send-btn" id="rs-send-btn" onclick="sendResumenCliente()">
          <i class="ti ti-send"></i> Enviar resumen al cliente
        </button>
      </div>
    </div>

    <div class="detail-tabs-wrap">
      <div class="tabs" style="padding:12px 0 0">
        <button class="tab-btn${ACTIVE_TAB==='profile'?' active':''}" data-tab="profile" onclick="switchTab('profile')"><i class="ti ti-user"></i> Perfil</button>
        <button class="tab-btn${ACTIVE_TAB==='workout'?' active':''}" data-tab="workout" onclick="switchTab('workout')"><i class="ti ti-barbell"></i> Entreno</button>
        <button class="tab-btn${ACTIVE_TAB==='diet'?' active':''}" data-tab="diet" onclick="switchTab('diet')"><i class="ti ti-apple"></i> Nutrición</button>
        <button class="tab-btn${ACTIVE_TAB==='cardio'?' active':''}" data-tab="cardio" onclick="switchTab('cardio')"><i class="ti ti-run"></i> Cardio</button>
        <button class="tab-btn${ACTIVE_TAB==='supplements'?' active':''}" data-tab="supplements" onclick="switchTab('supplements')"><i class="ti ti-pill"></i> Supls</button>
        <button class="tab-btn${ACTIVE_TAB==='measures'?' active':''}" data-tab="measures" onclick="switchTab('measures')"><i class="ti ti-ruler"></i> Medidas</button>
        <button class="tab-btn${ACTIVE_TAB==='progress'?' active':''}" data-tab="progress" onclick="switchTab('progress')"><i class="ti ti-chart-line"></i> Progreso</button>
        <button class="tab-btn${ACTIVE_TAB==='chat'?' active':''}" data-tab="chat" onclick="switchTab('chat')" id="tab-btn-chat" style="position:relative"><i class="ti ti-message-circle"></i> Chat<span id="chat-tab-badge" style="display:none;position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:#E24B4A"></span></button>
      </div>
      <div id="tab-content" style="padding:16px 0 40px"></div>
    </div>
  `
  renderTab()
}

function buildDayResumen(client, log) {
  const firstName = (client.profiles?.full_name || 'Cliente').split(' ')[0]
  if (!log) {
    return {
      summaryLine: 'Sin registro hoy. El cliente aún no ha completado ninguna actividad.',
      msgBody: `Hola ${firstName},\n\nHoy no hemos recibido ningún registro de actividad. Recuerda completar tu seguimiento diario en la app.\n\n¡Ánimo!`
    }
  }
  const score = log.score || 0
  const st = Math.round(log.score_training || 0)
  const sn = Math.round(log.score_nutrition || 0)
  const sc = Math.round(log.score_cardio || 0)
  const steps = log.steps || 0
  const stepsGoal = client.steps_goal || 10000
  const stepsStr = `${steps.toLocaleString('es-ES')}/${stepsGoal.toLocaleString('es-ES')}`
  const incident = score >= 80 ? 'Sin incidencias detectadas.' : score >= 50 ? 'Adherencia mejorable.' : 'Revisar adherencia al plan.'

  const summaryLine = `Score del día: ${score}%. Entrenamiento al ${st}%, nutrición al ${sn}%, pasos ${stepsStr}. ${incident}`

  const quality = score >= 90 ? 'excelente' : score >= 75 ? 'muy buena' : score >= 60 ? 'buena' : 'correcta'
  const phase = client.phase_name ? ` de ${client.phase_name.toLowerCase()}` : ''
  let lines = [`Hola ${firstName},`, '']

  if (st >= 90 && sn >= 80) {
    lines.push(`Tu sesión de hoy ha sido ${quality}. Completaste todos los ejercicios con las cargas establecidas y la adherencia nutricional está en línea con el objetivo${phase}.`)
  } else if (st >= 70) {
    lines.push(`Tu sesión de hoy ha sido ${quality}. Completaste el ${st}% del entrenamiento previsto.`)
    if (sn < 75) lines.push(`La nutrición está al ${sn}% — revisa los alimentos pendientes del plan.`)
  } else if (st > 0 || sn > 0) {
    lines.push(`Adherencia ${quality} hoy.`)
    if (st < 50) lines.push(`Entrenamiento al ${st}% — intenta completar todos los bloques.`)
    if (sn < 50) lines.push(`Nutrición al ${sn}% — presta más atención al seguimiento de comidas.`)
  } else {
    lines.push(`Hoy no hay actividad registrada. Comprueba que el cliente está usando la app correctamente.`)
  }

  if (steps >= stepsGoal) lines.push(`Pasos completados: ${steps.toLocaleString('es-ES')} — ¡objetivo superado!`)
  else if (steps > 0 && steps < stepsGoal * 0.7) lines.push(`Pasos: ${stepsStr} — empuja un poco más en los próximos días.`)

  return { summaryLine, msgBody: lines.join('\n') }
}


window.sendResumenCliente = async function() {
  if (!SELECTED_CLIENT || !TRAINER_ID || !CURRENT_RESUMEN_MSG) return
  const btn = document.getElementById('rs-send-btn')
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Enviando...' }

  const motivational = [
    '¡Tú puedes hacerlo! Cada día cuenta.',
    '¡Sigue así! El esfuerzo de hoy es el resultado de mañana.',
    '¡Gran trabajo! Mantén el ritmo.',
    '¡Cada sesión te acerca más a tu objetivo!',
    '¡El progreso es constante cuando eres constante!',
  ]
  const extra = motivational[Math.floor(Math.random() * motivational.length)]
  const fullMsg = CURRENT_RESUMEN_MSG + `\n\n${extra}\n\n— ${TRAINER_NAME}, Tu Preparador`

  const { data } = await supabase.from('messages')
    .insert({ client_id: SELECTED_CLIENT, sender_id: TRAINER_ID, content: fullMsg })
    .select().single()

  if (data) {
    sendPushToClient(SELECTED_CLIENT, 'Resumen de tu preparador', fullMsg.split('\n')[0])
  }

  if (btn) {
    if (data) {
      btn.innerHTML = '<i class="ti ti-circle-check"></i> Mensaje enviado'
      btn.style.background = '#1D9E75'
      setTimeout(() => {
        btn.disabled = false
        btn.style.background = ''
        btn.innerHTML = '<i class="ti ti-send"></i> Enviar resumen al cliente'
      }, 3000)
    } else {
      btn.disabled = false
      btn.innerHTML = '<i class="ti ti-send"></i> Enviar resumen al cliente'
    }
  }
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
  else if (ACTIVE_TAB === 'chat') renderChatTab(el)
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
      <div class="form-group">
        <label class="form-label">Nivel de actividad</label>
        <select id="p-activity" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.05);color:#fff;font-family:inherit;font-size:14px;outline:none">
          <option value="">Sin especificar</option>
          <option value="sedentaria" ${c.activity_level === 'sedentaria' ? 'selected' : ''}>Sedentaria</option>
          <option value="moderada" ${c.activity_level === 'moderada' ? 'selected' : ''}>Moderada</option>
          <option value="activo" ${c.activity_level === 'activo' ? 'selected' : ''}>Activo</option>
          <option value="muy_activo" ${c.activity_level === 'muy_activo' ? 'selected' : ''}>Muy activo</option>
        </select>
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
    <button class="btn" onclick="inviteClient()" style="width:100%;margin-top:8px;background:var(--bg3);border-color:var(--green);color:var(--green)">
      <i class="ti ti-send"></i> Invitar cliente
    </button>
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
    activity_level: document.getElementById('p-activity').value || null,
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

window.inviteClient = async function() {
  const c = SELECTED_CLIENT_DATA.client
  const clientName = c.profiles?.full_name || 'tu cliente'
  const trainerName = TRAINER_PROFILE_SNAPSHOT?.full_name || 'Tu Preparador'

  const btn = document.querySelector('button[onclick="inviteClient()"]')
  if (btn) { btn.disabled = true; btn.textContent = 'Generando enlace...' }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/generate-invite-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ clientId: SELECTED_CLIENT })
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    const link = data.link
    const msg = `¡Hola ${clientName}! 👋\n\nTe doy la bienvenida a *Tu Preparador*, la app con la que vamos a trabajar juntos tu plan de entrenamiento y nutrición.\n\nSoy ${trainerName}, tu preparador personal. A partir de ahora podrás ver tu plan, registrar tu progreso diario y seguir tu evolución directamente desde la app.\n\n👉 Accede aquí con tu enlace personal (válido para una sola sesión):\n${link}\n\nUna vez dentro, ya podrás iniciar sesión cuando quieras desde:\n🌐 www.tupreparador.es\n\n¡Cualquier duda, estoy aquí! 💪`

    showInviteModal(msg)
  } catch (e) {
    showNotif('Error al generar enlace: ' + e.message)
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Invitar cliente' }
  }
}

function showInviteModal(msg) {
  const existing = document.getElementById('invite-modal-overlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'invite-modal-overlay'
  overlay.className = 'modal-overlay open'
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;width:90%">
      <div class="card-title" style="margin-bottom:12px"><i class="ti ti-send" style="color:var(--green)"></i> Mensaje de bienvenida</div>
      <textarea id="invite-msg-text" style="min-height:260px;font-size:13px;line-height:1.6;white-space:pre-wrap">${msg.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary" style="flex:1" onclick="copyInviteMsg()"><i class="ti ti-copy"></i> Copiar</button>
        <button class="btn" style="flex:1;background:#25D366;color:#fff;border-color:#25D366" onclick="shareInviteWhatsApp()"><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>
        <button class="btn" style="background:var(--bg3)" onclick="document.getElementById('invite-modal-overlay').remove()"><i class="ti ti-x"></i></button>
      </div>
    </div>
  `
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)
}

window.copyInviteMsg = function() {
  const text = document.getElementById('invite-msg-text').value
  navigator.clipboard.writeText(text).then(() => showNotif('Mensaje copiado ✓'))
}

window.shareInviteWhatsApp = function() {
  const text = document.getElementById('invite-msg-text').value
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
}

window.toggleClientActive = async function(active) {
  await supabase.from('clients').update({ active }).eq('id', SELECTED_CLIENT)
  SELECTED_CLIENT_DATA.client.active = active
  const idx = ALL_CLIENTS.findIndex(c => c.id === SELECTED_CLIENT)
  if (idx >= 0) ALL_CLIENTS[idx].active = active
  renderNavBadges()
  applyCurrentFilter()
}

// ─── TAB: ENTRENO ─────────────────────────────────────────────────────────────

function renderWorkoutTab(el) {
  el.innerHTML = `
    <div class="card" style="margin-bottom:12px;border-color:var(--blue)44">
      <div class="card-title" style="color:var(--blue)"><i class="ti ti-wand"></i> Editor de plan</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Di o escribe qué quieres cambiar en el plan. Ej: <em>"El lunes añade press de banca 4x8"</em>, <em>"Quita las sentadillas del martes"</em>, <em>"El miércoles cambia el nombre del día a Piernas Fuerza"</em>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <textarea id="ai-instruction" style="flex:1;min-height:60px;resize:vertical;font-size:13px" placeholder="Instrucción para modificar el plan..."></textarea>
        ${voiceMicBtn('ai-instruction')}
      </div>
      <button class="btn btn-primary" onclick="applyAIInstruction(this)" style="margin-top:10px;width:100%">
        <i class="ti ti-wand"></i> Aplicar cambios
      </button>
      <div id="ai-result" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
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
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label">Instrucciones del día</label>
        <div style="display:flex;gap:6px;align-items:flex-start">
          <textarea id="wo-day-notes" style="flex:1;min-height:60px;resize:vertical;font-size:13px" placeholder="Ej: Calienta 10 min antes, descansa 90s entre series...">${escHtml(day?.notes || '')}</textarea>
          ${voiceMicBtn('wo-day-notes')}
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
  const notes = document.getElementById('wo-day-notes')?.value ?? ''
  if (!title) { showNotif('Introduce el nombre del día'); return }

  const { data: day, error } = await supabase
    .from('workout_days')
    .upsert({ client_id: SELECTED_CLIENT, day_index: ACTIVE_DAY, title, duration, notes }, { onConflict: 'client_id,day_index' })
    .select()
    .single()

  if (!error) {
    const idx = SELECTED_CLIENT_DATA.workouts.findIndex(d => d.day_index === ACTIVE_DAY)
    if (idx >= 0) {
      SELECTED_CLIENT_DATA.workouts[idx].title = title
      SELECTED_CLIENT_DATA.workouts[idx].duration = duration
      SELECTED_CLIENT_DATA.workouts[idx].notes = notes
    } else {
      SELECTED_CLIENT_DATA.workouts.push({ ...day, workout_exercises: [] })
    }
    showNotif('Día guardado ✓')
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

// ─── IA EDITOR DE PLAN ────────────────────────────────────────────────────────

window.applyAIInstruction = async function(btn) {
  const instruction = document.getElementById('ai-instruction')?.value?.trim()
  if (!instruction) { showNotif('Escribe o dicta una instrucción'); return }

  const resultEl = document.getElementById('ai-result')
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Procesando...'
  resultEl.style.display = 'none'

  // Construir snapshot del plan actual
  const plan = {
    days: SELECTED_CLIENT_DATA.workouts.map(d => ({
      day_index: d.day_index,
      title: d.title,
      duration: d.duration || '',
      notes: d.notes || '',
      exercises: (d.workout_exercises || []).map(e => ({
        id: e.id,
        name: e.name,
        sets_reps: e.sets_reps,
        note: e.note || '',
        order_index: e.order_index,
      }))
    }))
  }

  try {
    const token = await getAuthToken()
    const res = await fetch(
      'https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/ai-plan-editor',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ instruction, plan })
      }
    )
    const resData = await res.json()
    const { actions, error, debug } = resData

    if (error) throw new Error(error)
    if (!actions?.length) {
      resultEl.style.display = 'block'
      resultEl.style.color = 'var(--amber)'
      resultEl.innerHTML = `<i class="ti ti-alert-triangle"></i> No se generaron cambios.<br><small style="color:var(--text3)">${debug || 'Sin respuesta'}</small>`
      btn.disabled = false
      btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
      return
    }

    await applyAIPlanActions(actions)

    resultEl.style.display = 'block'
    resultEl.style.color = 'var(--green)'
    resultEl.innerHTML = `<i class="ti ti-circle-check"></i> ${actions.length} cambio(s) aplicado(s) correctamente.`
    document.getElementById('ai-instruction').value = ''
    renderWoDay()
  } catch (err) {
    resultEl.style.display = 'block'
    resultEl.style.color = 'var(--red)'
    resultEl.innerHTML = `<i class="ti ti-alert-circle"></i> ${err.message}`
  }

  btn.disabled = false
  btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
}

async function applyAIPlanActions(actions) {
  for (const action of actions) {
    if (action.type === 'add_exercise') {
      let day = SELECTED_CLIENT_DATA.workouts.find(d => d.day_index === action.day_index)
      let dayId = day?.id
      if (!dayId) {
        const { data } = await supabase.from('workout_days')
          .upsert({ client_id: SELECTED_CLIENT, day_index: action.day_index, title: DAYS[action.day_index] }, { onConflict: 'client_id,day_index' })
          .select().single()
        dayId = data?.id
        day = { ...data, workout_exercises: [] }
        SELECTED_CLIENT_DATA.workouts.push(day)
      }
      const order = day.workout_exercises?.length || 0
      const { data: ex } = await supabase.from('workout_exercises').insert({
        workout_day_id: dayId,
        name: action.name,
        sets_reps: action.sets_reps || '3x10',
        note: action.note || null,
        order_index: order,
      }).select().single()
      if (ex) day.workout_exercises.push(ex)

    } else if (action.type === 'remove_exercise') {
      await supabase.from('workout_exercises').delete().eq('id', action.exercise_id)
      SELECTED_CLIENT_DATA.workouts.forEach(d => {
        d.workout_exercises = (d.workout_exercises || []).filter(e => e.id !== action.exercise_id)
      })

    } else if (action.type === 'edit_exercise') {
      const changes = action.changes || {}
      await supabase.from('workout_exercises').update(changes).eq('id', action.exercise_id)
      SELECTED_CLIENT_DATA.workouts.forEach(d => {
        const ex = (d.workout_exercises || []).find(e => e.id === action.exercise_id)
        if (ex) Object.assign(ex, changes)
      })

    } else if (action.type === 'update_day') {
      const day = SELECTED_CLIENT_DATA.workouts.find(d => d.day_index === action.day_index)
      if (day?.id) {
        await supabase.from('workout_days').update(action.changes).eq('id', day.id)
        Object.assign(day, action.changes)
      }
    }
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
  const meals = (diet?.diet_meals || [])
    .filter(m => (m.day_index ?? 0) === ACTIVE_DIET_DAY)
    .slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  el.innerHTML = `
    <div class="day-sel" id="diet-day-sel"></div>
    <div class="card" style="margin-bottom:12px;border-color:var(--blue)44">
      <div class="card-title" style="color:var(--blue)"><i class="ti ti-wand"></i> Editor de dieta</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Di o escribe qué quieres cambiar. Ej: <em>"Añade 200g de arroz al almuerzo"</em>, <em>"Quita el batido de proteínas del desayuno"</em>, <em>"Cambia el pollo por salmón en la cena"</em>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <textarea id="ai-diet-instruction" style="flex:1;min-height:60px;resize:vertical;font-size:13px" placeholder="Instrucción para modificar la dieta..."></textarea>
        ${voiceMicBtn('ai-diet-instruction')}
      </div>
      <button class="btn btn-primary" onclick="applyAIDietInstruction(this)" style="margin-top:10px;width:100%">
        <i class="ti ti-wand"></i> Aplicar cambios
      </button>
      <div id="ai-diet-result" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
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

  renderDietDaySel()
  initMealDrag()
}

function renderDietDaySel() {
  const sel = document.getElementById('diet-day-sel')
  if (!sel) return
  sel.innerHTML = DAYS.map((d, i) =>
    `<button class="${i === ACTIVE_DIET_DAY ? 'active' : ''}" onclick="selectDietDay(${i})">${d}</button>`
  ).join('')
}

window.selectDietDay = function(i) {
  ACTIVE_DIET_DAY = i
  renderDietDaySel()
  const el = document.getElementById('tab-content')
  if (el) renderDietTab(el)
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
    .insert({ diet_plan_id: SELECTED_CLIENT_DATA.diet.id, name, icon, order_index: existing, day_index: ACTIVE_DIET_DAY })
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

// ─── IA EDITOR DE DIETA ───────────────────────────────────────────────────────

window.applyAIDietInstruction = async function(btn) {
  const instruction = document.getElementById('ai-diet-instruction')?.value?.trim()
  if (!instruction) { showNotif('Escribe o dicta una instrucción'); return }

  const resultEl = document.getElementById('ai-diet-result')
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Procesando...'
  resultEl.style.display = 'none'

  const diet = SELECTED_CLIENT_DATA.diet
  if (!diet) {
    resultEl.style.display = 'block'
    resultEl.style.color = 'var(--amber)'
    resultEl.innerHTML = '<i class="ti ti-alert-triangle"></i> No hay plan de dieta activo. Crea uno primero.'
    btn.disabled = false
    btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
    return
  }

  // Solo enviar a la IA las comidas del día activo
  const plan = {
    day: DAYS[ACTIVE_DIET_DAY],
    meals: (diet.diet_meals || [])
      .filter(m => (m.day_index ?? 0) === ACTIVE_DIET_DAY)
      .map(m => ({
        id: m.id,
        name: m.name,
        icon: m.icon || '',
        foods: (m.diet_foods || []).map(f => ({
          id: f.id,
          name: f.name,
          kcal: f.kcal || 0,
          protein_g: f.protein_g || 0
        }))
      }))
  }

  try {
    const token = await getAuthToken()
    const res = await fetch(
      'https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/ai-diet-editor',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ instruction, plan })
      }
    )
    const resData = await res.json()
    const { actions, error, debug } = resData

    if (error) throw new Error(error)
    if (!actions?.length) {
      resultEl.style.display = 'block'
      resultEl.style.color = 'var(--amber)'
      resultEl.innerHTML = `<i class="ti ti-alert-triangle"></i> No se generaron cambios.<br><small style="color:var(--text3)">${debug || 'Sin respuesta'}</small>`
      btn.disabled = false
      btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
      return
    }

    await applyAIDietActions(actions)

    // renderTab() destruye el DOM — re-renderizar primero, luego escribir el mensaje en el DOM fresco
    renderTab()
    const freshResult = document.getElementById('ai-diet-result')
    if (freshResult) {
      const summary = actions.map(a => {
        if (a.type === 'add_meal') return `+ Comida: ${a.name}`
        if (a.type === 'add_food') return `+ Alimento: ${a.name}`
        if (a.type === 'edit_food') return `✎ Editado: ${JSON.stringify(a.changes)}`
        if (a.type === 'remove_food') return `− Alimento eliminado`
        if (a.type === 'rename_meal') return `✎ Comida renombrada: ${a.name}`
        if (a.type === 'remove_meal') return `− Comida eliminada`
        return a.type
      }).join('<br>')
      freshResult.style.display = 'block'
      freshResult.style.color = 'var(--green)'
      freshResult.innerHTML = `<i class="ti ti-circle-check"></i> ${actions.length} cambio(s) aplicado(s):<br><small style="color:var(--text2)">${summary}</small>`
    }
  } catch (err) {
    const el = document.getElementById('ai-diet-result') || resultEl
    el.style.display = 'block'
    el.style.color = 'var(--red)'
    el.innerHTML = `<i class="ti ti-alert-circle"></i> ${err.message}`
  }

  btn.disabled = false
  btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
}

async function applyAIDietActions(actions) {
  const diet = SELECTED_CLIENT_DATA.diet
  for (const action of actions) {
    if (action.type === 'add_meal') {
      const dayMeals = (diet.diet_meals || []).filter(m => (m.day_index ?? 0) === ACTIVE_DIET_DAY)
      const { data: meal, error } = await supabase
        .from('diet_meals')
        .insert({ diet_plan_id: diet.id, name: action.name, icon: action.icon || '🍽️', order_index: dayMeals.length, day_index: ACTIVE_DIET_DAY })
        .select('*, diet_foods(*)')
        .single()
      if (error) throw new Error(`add_meal "${action.name}": ${error.message}`)
      if (meal) {
        diet.diet_meals = diet.diet_meals || []
        diet.diet_meals.push({ ...meal, diet_foods: [] })
      }
    } else if (action.type === 'add_food') {
      const meal = diet.diet_meals?.find(m =>
        m.id === action.meal_id ||
        m.name.toLowerCase() === (action.meal_name || '').toLowerCase()
      )
      if (!meal) throw new Error(`add_food: comida no encontrada (id: ${action.meal_id}, nombre: ${action.meal_name})`)
      const { data: food, error } = await supabase
        .from('diet_foods')
        .insert({ diet_meal_id: meal.id, name: action.name, kcal: action.kcal || 0, protein_g: action.protein_g || 0, order_index: meal.diet_foods?.length || 0 })
        .select().single()
      if (error) throw new Error(`add_food "${action.name}": ${error.message}`)
      if (food) meal.diet_foods = [...(meal.diet_foods || []), food]
    } else if (action.type === 'edit_food') {
      const changes = action.changes || {}
      const { error } = await supabase.from('diet_foods').update(changes).eq('id', action.food_id)
      if (error) throw new Error(`edit_food: ${error.message}`)
      for (const meal of (diet.diet_meals || [])) {
        const food = meal.diet_foods?.find(f => f.id === action.food_id)
        if (food) { Object.assign(food, changes); break }
      }
    } else if (action.type === 'remove_food') {
      const { error } = await supabase.from('diet_foods').delete().eq('id', action.food_id)
      if (error) throw new Error(`remove_food: ${error.message}`)
      for (const meal of (diet.diet_meals || [])) {
        meal.diet_foods = (meal.diet_foods || []).filter(f => f.id !== action.food_id)
      }
    } else if (action.type === 'rename_meal') {
      const { error } = await supabase.from('diet_meals').update({ name: action.name }).eq('id', action.meal_id)
      if (error) throw new Error(`rename_meal: ${error.message}`)
      const meal = diet.diet_meals?.find(m => m.id === action.meal_id)
      if (meal) meal.name = action.name
    } else if (action.type === 'remove_meal') {
      const { error } = await supabase.from('diet_meals').delete().eq('id', action.meal_id)
      if (error) throw new Error(`remove_meal: ${error.message}`)
      diet.diet_meals = (diet.diet_meals || []).filter(m => m.id !== action.meal_id)
    }
  }
}

// ─── IA EDITOR DE CARDIO ──────────────────────────────────────────────────────

window.applyAICardioInstruction = async function(btn) {
  const instruction = document.getElementById('ai-cardio-instruction')?.value?.trim()
  if (!instruction) { showNotif('Escribe o dicta una instrucción'); return }
  const resultEl = document.getElementById('ai-cardio-result')
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Procesando...'
  resultEl.style.display = 'none'

  const c = SELECTED_CLIENT_DATA.client
  const context = {
    steps_goal: c.steps_goal || 9000,
    cardio_goal_min: c.cardio_goal_min || 185,
    reminder_interval_min: c.reminder_interval_min || null,
    cardio_types: c.cardio_types || [],
    available_types: CARDIO_TYPES.map(t => t.id)
  }

  try {
    const token = await getAuthToken()
    const res = await fetch('https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/ai-cardio-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ instruction, context })
    })
    const resData = await res.json()
    const { actions, error, debug } = resData
    if (error) throw new Error(error)
    if (!actions?.length) {
      resultEl.style.display = 'block'; resultEl.style.color = 'var(--amber)'
      resultEl.innerHTML = `<i class="ti ti-alert-triangle"></i> No se generaron cambios.<br><small style="color:var(--text3)">${debug || ''}</small>`
      btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'; return
    }
    const updates = {}
    for (const action of actions) {
      if (action.type === 'set_steps_goal') updates.steps_goal = action.value
      else if (action.type === 'set_cardio_goal') updates.cardio_goal_min = action.value
      else if (action.type === 'set_reminder') updates.reminder_interval_min = action.value
      else if (action.type === 'set_cardio_types') updates.cardio_types = action.types
    }
    if (Object.keys(updates).length) {
      await supabase.from('clients').update(updates).eq('id', SELECTED_CLIENT)
      Object.assign(SELECTED_CLIENT_DATA.client, updates)
    }
    resultEl.style.display = 'block'; resultEl.style.color = 'var(--green)'
    resultEl.innerHTML = `<i class="ti ti-circle-check"></i> ${actions.length} cambio(s) aplicado(s).`
    document.getElementById('ai-cardio-instruction').value = ''
    renderTab()
  } catch (err) {
    resultEl.style.display = 'block'; resultEl.style.color = 'var(--red)'
    resultEl.innerHTML = `<i class="ti ti-alert-circle"></i> ${err.message}`
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
}

// ─── IA EDITOR DE SUPLEMENTOS ─────────────────────────────────────────────────

window.applyAISuplsInstruction = async function(btn) {
  const instruction = document.getElementById('ai-supls-instruction')?.value?.trim()
  if (!instruction) { showNotif('Escribe o dicta una instrucción'); return }
  const resultEl = document.getElementById('ai-supls-result')
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Procesando...'
  resultEl.style.display = 'none'

  const plan = {
    supplements: SELECTED_CLIENT_DATA.supplements.map(s => ({
      id: s.id, name: s.name, dose: s.dose || '', protein_g: s.protein_g || 0, kcal: s.kcal || 0, timing: s.timing || ''
    })),
    available_timings: SUPL_TIMINGS.map(t => t.value)
  }

  try {
    const token = await getAuthToken()
    const res = await fetch('https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/ai-supls-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ instruction, plan })
    })
    const resData = await res.json()
    const { actions, error, debug } = resData
    if (error) throw new Error(error)
    if (!actions?.length) {
      resultEl.style.display = 'block'; resultEl.style.color = 'var(--amber)'
      resultEl.innerHTML = `<i class="ti ti-alert-triangle"></i> No se generaron cambios.<br><small style="color:var(--text3)">${debug || ''}</small>`
      btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'; return
    }
    for (const action of actions) {
      if (action.type === 'add_supplement') {
        const order = SELECTED_CLIENT_DATA.supplements.length
        const { data: s } = await supabase.from('supplements')
          .insert({ client_id: SELECTED_CLIENT, name: action.name, dose: action.dose || '', protein_g: action.protein_g || 0, kcal: action.kcal || 0, timing: action.timing || null, order_index: order })
          .select().single()
        if (s) SELECTED_CLIENT_DATA.supplements.push(s)
      } else if (action.type === 'edit_supplement') {
        await supabase.from('supplements').update(action.changes).eq('id', action.supplement_id)
        const s = SELECTED_CLIENT_DATA.supplements.find(s => s.id === action.supplement_id)
        if (s) Object.assign(s, action.changes)
      } else if (action.type === 'remove_supplement') {
        await supabase.from('supplements').delete().eq('id', action.supplement_id)
        SELECTED_CLIENT_DATA.supplements = SELECTED_CLIENT_DATA.supplements.filter(s => s.id !== action.supplement_id)
      }
    }
    resultEl.style.display = 'block'; resultEl.style.color = 'var(--green)'
    resultEl.innerHTML = `<i class="ti ti-circle-check"></i> ${actions.length} cambio(s) aplicado(s).`
    document.getElementById('ai-supls-instruction').value = ''
    renderTab()
  } catch (err) {
    resultEl.style.display = 'block'; resultEl.style.color = 'var(--red)'
    resultEl.innerHTML = `<i class="ti ti-alert-circle"></i> ${err.message}`
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Aplicar cambios'
}

// ─── IA EDITOR DE MEDIDAS ─────────────────────────────────────────────────────

window.applyAIMeasuresInstruction = async function(btn) {
  const instruction = document.getElementById('ai-measures-instruction')?.value?.trim()
  if (!instruction) { showNotif('Dicta las medidas del cliente'); return }
  const resultEl = document.getElementById('ai-measures-result')
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Procesando...'
  resultEl.style.display = 'none'

  try {
    const token = await getAuthToken()
    const res = await fetch('https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/ai-measures-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ instruction })
    })
    const resData = await res.json()
    const { measurement, error, debug } = resData
    if (error) throw new Error(error)
    if (!measurement) {
      resultEl.style.display = 'block'; resultEl.style.color = 'var(--amber)'
      resultEl.innerHTML = `<i class="ti ti-alert-triangle"></i> No se pudieron extraer medidas.<br><small style="color:var(--text3)">${debug || ''}</small>`
      btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Registrar medidas'; return
    }
    const { error: dbErr } = await supabase.from('body_measurements')
      .insert({ client_id: SELECTED_CLIENT, measured_at: measurement.date || new Date().toISOString().split('T')[0], ...measurement })
    if (dbErr) throw new Error(dbErr.message)
    resultEl.style.display = 'block'; resultEl.style.color = 'var(--green)'
    resultEl.innerHTML = '<i class="ti ti-circle-check"></i> Medidas registradas correctamente.'
    document.getElementById('ai-measures-instruction').value = ''
    renderTab()
  } catch (err) {
    resultEl.style.display = 'block'; resultEl.style.color = 'var(--red)'
    resultEl.innerHTML = `<i class="ti ti-alert-circle"></i> ${err.message}`
  }
  btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Registrar medidas'
}

// ─── TAB: SUPLEMENTOS ─────────────────────────────────────────────────────────

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
    <div class="card" style="margin-bottom:12px;border-color:var(--blue)44">
      <div class="card-title" style="color:var(--blue)"><i class="ti ti-wand"></i> Editor de suplementación</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Di o escribe qué quieres cambiar. Ej: <em>"Añade creatina 5g por la mañana"</em>, <em>"Quita la proteína de suero"</em>, <em>"Cambia la dosis de magnesio a 400mg"</em>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <textarea id="ai-supls-instruction" style="flex:1;min-height:60px;resize:vertical;font-size:13px" placeholder="Instrucción para modificar la suplementación..."></textarea>
        ${voiceMicBtn('ai-supls-instruction')}
      </div>
      <button class="btn btn-primary" onclick="applyAISuplsInstruction(this)" style="margin-top:10px;width:100%">
        <i class="ti ti-wand"></i> Aplicar cambios
      </button>
      <div id="ai-supls-result" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
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
    <div class="card" style="margin-bottom:12px;border-color:var(--blue)44">
      <div class="card-title" style="color:var(--blue)"><i class="ti ti-wand"></i> Editor de cardio</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Di o escribe qué quieres cambiar. Ej: <em>"Pon el objetivo de pasos a 10.000"</em>, <em>"Añade ciclismo y natación"</em>, <em>"Cambia el cardio semanal a 200 minutos"</em>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <textarea id="ai-cardio-instruction" style="flex:1;min-height:60px;resize:vertical;font-size:13px" placeholder="Instrucción para modificar el cardio..."></textarea>
        ${voiceMicBtn('ai-cardio-instruction')}
      </div>
      <button class="btn btn-primary" onclick="applyAICardioInstruction(this)" style="margin-top:10px;width:100%">
        <i class="ti ti-wand"></i> Aplicar cambios
      </button>
      <div id="ai-cardio-result" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
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
    <div class="card" style="margin-bottom:12px;border-color:var(--blue)44">
      <div class="card-title" style="color:var(--blue)"><i class="ti ti-wand"></i> Registrar medidas por voz</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Dicta las medidas y se registran automáticamente. Ej: <em>"Peso 71 kilos, cintura 76 cm, brazo derecho 33 cm, cadera 94 cm"</em>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <textarea id="ai-measures-instruction" style="flex:1;min-height:60px;resize:vertical;font-size:13px" placeholder="Dicta las medidas del cliente..."></textarea>
        ${voiceMicBtn('ai-measures-instruction')}
      </div>
      <button class="btn btn-primary" onclick="applyAIMeasuresInstruction(this)" style="margin-top:10px;width:100%">
        <i class="ti ti-wand"></i> Registrar medidas
      </button>
      <div id="ai-measures-result" style="margin-top:10px;font-size:12px;display:none"></div>
    </div>
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

  // Verificar límite del plan
  if (SUBSCRIPTION_STATUS === 'active' && PLAN_TIER && PLAN_TIER !== 'studio') {
    const limit = TIER_LIMITS[PLAN_TIER] || 30
    const activeCount = ALL_CLIENTS.filter(c => c.active !== false).length
    if (activeCount >= limit) {
      errEl.textContent = `Has alcanzado el límite de ${limit} clientes del plan ${TIER_LABELS[PLAN_TIER]}. Amplía tu plan para añadir más.`
      errEl.style.display = 'block'
      return
    }
  }

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
    activity_level: document.getElementById('nc-activity').value || null,
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
  const profileBtn = document.getElementById('my-profile-btn')
  if (profileBtn) { profileBtn.style.color = 'var(--blue)'; profileBtn.style.borderColor = 'var(--blue)' }

  // Mobile: show main panel like selecting a client
  if (window.innerWidth <= 640) {
    document.body.classList.add('mobile-detail')
    document.querySelector('.main').style.display = 'block'
    const ms = document.getElementById('mobile-search')
    if (ms) ms.style.display = 'none'
    document.querySelectorAll('.mnav-tab').forEach(el => el.classList.remove('active'))
    const panelTab = document.getElementById('mnav-panel')
    if (panelTab) panelTab.classList.add('active')
  }

  const main = document.getElementById('main-content')
  main.innerHTML = '<div style="display:flex;justify-content:center;padding:40px"><div class="spinner"></div></div>'

  const today = new Date().toISOString().split('T')[0]
  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6)
  const sevenAgoStr = sevenAgo.toISOString().split('T')[0]
  const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 29)
  const thirtyAgoStr = thirtyAgo.toISOString().split('T')[0]

  const clientIds = ALL_CLIENTS.map(c => c.id)

  const [
    { data: trainerData },
    { data: profileData },
    { data: todayLogs },
    { data: weekLogs },
    { data: monthLogs },
  ] = await Promise.all([
    supabase.from('trainers').select('bio, specialty, max_clients, subscription_status, trial_ends_at, plan_tier').eq('id', TRAINER_ID).single(),
    supabase.from('profiles').select('full_name, email').eq('id', TRAINER_ID).single(),
    clientIds.length
      ? supabase.from('daily_logs').select('client_id, score').eq('log_date', today).in('client_id', clientIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase.from('daily_logs').select('client_id, score').gte('log_date', sevenAgoStr).in('client_id', clientIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase.from('daily_logs').select('client_id, log_date').gte('log_date', thirtyAgoStr).in('client_id', clientIds)
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

  // Retención: clientes activos con al menos 1 log en los últimos 7 días
  const loggedD7 = new Set((weekLogs || []).map(l => l.client_id))
  const retentionD7 = activeClients.length
    ? Math.round((loggedD7.size / activeClients.length) * 100)
    : null

  // Retención D30: clientes con al menos 4 logs en los últimos 30 días (hábito)
  const logsPerClientD30 = {}
  ;(monthLogs || []).forEach(l => { logsPerClientD30[l.client_id] = (logsPerClientD30[l.client_id] || 0) + 1 })
  const habitCount = activeClients.filter(c => (logsPerClientD30[c.id] || 0) >= 4).length
  const retentionHabit = activeClients.length
    ? Math.round((habitCount / activeClients.length) * 100)
    : null

  // Suscripción
  const subStatus = trainerData?.subscription_status || 'trial'
  const planTier  = trainerData?.plan_tier || null
  const subColors = { trial: '#BA7517', active: '#1D9E75', past_due: '#BA7517', canceled: '#E24B4A', unpaid: '#E24B4A', expired: '#E24B4A' }
  const subLabelText = subStatus === 'active' && planTier
    ? `${TIER_LABELS[planTier]} · activo`
    : subStatus === 'trial' ? 'Trial'
    : subStatus === 'past_due' ? 'Pago fallido'
    : 'Sin suscripción'
  const trialEnd = trainerData?.trial_ends_at
    ? new Date(trainerData.trial_ends_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : null

  renderMyProfileView({
    snap: TRAINER_PROFILE_SNAPSHOT,
    email: profileData?.email || '',
    activeClients, inactiveClients,
    globalAvg, avgScores,
    loggedToday, loggedD7, atRisk,
    subStatus, subColors, subLabelText, trialEnd,
    retentionD7, retentionHabit, habitCount,
    logsPerClientD30,
  })
}

function renderMyProfileView({ snap, email, activeClients, inactiveClients, globalAvg, avgScores, loggedToday, loggedD7, atRisk, subStatus, subColors, subLabelText, trialEnd, retentionD7, retentionHabit, habitCount, logsPerClientD30 }) {
  const main = document.getElementById('main-content')

  const scoreColor = s => s >= 80 ? 'var(--green)' : s >= 50 ? 'var(--amber)' : 'var(--red)'
  const scoreBar = s => `<div style="height:4px;border-radius:2px;background:var(--border);margin-top:4px"><div style="height:4px;border-radius:2px;background:${scoreColor(s)};width:${s}%"></div></div>`

  main.innerHTML = `
    <!-- BACK BUTTON (solo móvil) -->
    <div class="detail-topbar">
      <span class="d-btn" id="mobile-back-btn" onclick="mobileBackToList()" title="Volver" style="display:none"><i class="ti ti-arrow-left"></i></span>
      <span class="d-btn-spacer"></span>
    </div>

    <!-- CABECERA -->
    <div style="padding:0 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:20px;font-weight:700;margin:0">${escHtml(snap.full_name) || 'Mi negocio'}</h2>
        ${snap.specialty ? `<div style="font-size:13px;color:var(--text2);margin-top:3px">${escHtml(snap.specialty)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;background:${(subColors[subStatus]||'#BA7517')}22;color:${(subColors[subStatus]||'#BA7517')};border:1px solid ${(subColors[subStatus]||'#BA7517')}44;cursor:pointer" onclick="showPaywall()">
          ● ${subLabelText}${trialEnd ? ' · hasta ' + trialEnd : ''}
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
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px">
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

    <!-- MÉTRICAS DE RETENCIÓN -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:6px;letter-spacing:.05em">RETENCIÓN D7</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <div style="font-size:28px;font-weight:800;color:${retentionD7 == null ? 'var(--text3)' : retentionD7 >= 60 ? 'var(--green)' : retentionD7 >= 30 ? 'var(--amber)' : 'var(--red)'};line-height:1">
            ${retentionD7 != null ? retentionD7 + '%' : '—'}
          </div>
          <div style="font-size:12px;color:var(--text3)">${retentionD7 != null ? `${loggedD7?.size || 0}/${activeClients.length} usan la app` : 'sin datos'}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Clientes con ≥1 registro esta semana</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:6px;letter-spacing:.05em">HÁBITO D30</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <div style="font-size:28px;font-weight:800;color:${retentionHabit == null ? 'var(--text3)' : retentionHabit >= 50 ? 'var(--green)' : retentionHabit >= 25 ? 'var(--amber)' : 'var(--red)'};line-height:1">
            ${retentionHabit != null ? retentionHabit + '%' : '—'}
          </div>
          <div style="font-size:12px;color:var(--text3)">${habitCount} cliente${habitCount !== 1 ? 's' : ''}</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Con ≥4 registros en los últimos 30 días</div>
      </div>
      <div class="card" style="padding:14px">
        <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:6px;letter-spacing:.05em">EN RIESGO</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <div style="font-size:28px;font-weight:800;color:${atRisk.length === 0 ? 'var(--green)' : atRisk.length <= 2 ? 'var(--amber)' : 'var(--red)'};line-height:1">
            ${atRisk.length}
          </div>
          <div style="font-size:12px;color:var(--text3)">sin registrar hoy</div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Clientes activos sin log hoy</div>
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
    </div>
  `

  // Show back button on mobile
  if (window.innerWidth <= 640) {
    const backBtn = document.getElementById('mobile-back-btn')
    if (backBtn) backBtn.style.display = 'inline-flex'
  }

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
    Object.entries(row).forEach(([k, v]) => {
      // Normalize key: lowercase, remove accents, strip units in parens, normalize spaces
      const nk = k.toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\([^)]*\)/g, '')   // remove (kg), (cm), (%), etc.
        .replace(/[^a-z0-9\s]/g, '') // remove special chars
        .replace(/\s+/g, ' ').trim()
      norm[nk] = String(v).trim()
    })
    return normalizeRow(norm)
  }).filter(r => r.nombre)
}

function normalizeKey(k) {
  return k.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ').trim()
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
  // obj keys already normalized by parseExcel/parseCsv

  // Exact match first, then partial (key contains keyword), excluding certain words
  const find = (keywords, exclude = []) => {
    // exact
    for (const kw of keywords) {
      const nkw = normalizeKey(kw)
      if (obj[nkw] != null && obj[nkw] !== '') return obj[nkw]
    }
    // partial
    for (const [k, v] of Object.entries(obj)) {
      if (!v || v === '') continue
      if (exclude.some(ex => k.includes(normalizeKey(ex)))) continue
      for (const kw of keywords) {
        if (k.includes(normalizeKey(kw))) return v
      }
    }
    return ''
  }

  // D/I helper: look for right-side column first, fall back to generic
  const findSide = (base, rightHints, leftHints) => {
    const r = find([...rightHints.map(h => base + ' ' + h), ...rightHints.map(h => h + ' ' + base)])
    const l = find([...leftHints.map(h => base + ' ' + h), ...leftHints.map(h => h + ' ' + base)])
    const generic = find([base])
    return { r: r || generic || '', l: l || '' }
  }

  const nombre = find(['nombre completo', 'nombre', 'name', 'full name', 'cliente', 'participante', 'apellido'])
  const email  = find(['email', 'correo electronico', 'correo', 'mail'])

  const emailAuto = !email && !!nombre
  const emailFinal = email || (nombre
    ? nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') + '@sinmail.local'
    : '')

  // Body measurements (only populated if columns exist)
  const brazo  = findSide('brazo',       ['d', 'der', 'derecho', 'r'],  ['i', 'izq', 'izquierdo', 'l'])
  const muslo  = findSide('muslo',       ['d', 'der', 'derecho', 'r'],  ['i', 'izq', 'izquierdo', 'l'])
  const gemelo = findSide('gemelo',      ['d', 'der', 'derecho', 'r'],  ['i', 'izq', 'izquierdo', 'l'])
  const panto  = findSide('pantorrilla', ['d', 'der', 'derecho', 'r'],  ['i', 'izq', 'izquierdo', 'l'])

  const meas = {
    weight_kg:    parseFloat(find(['peso inicial', 'peso actual', 'peso'], ['objetivo', 'meta', 'goal'])) || null,
    body_fat_pct: parseFloat(find(['grasa corporal', 'grasa', 'body fat', '% grasa'])) || null,
    waist_cm:     parseFloat(find(['cintura'])) || null,
    hips_cm:      parseFloat(find(['cadera'])) || null,
    chest_cm:     parseFloat(find(['pecho', 'torax', 'chest'])) || null,
    shoulder_cm:  parseFloat(find(['hombros', 'hombro', 'shoulder'])) || null,
    arm_r_cm:     parseFloat(brazo.r) || null,
    arm_l_cm:     parseFloat(brazo.l) || null,
    thigh_r_cm:   parseFloat(muslo.r) || null,
    thigh_l_cm:   parseFloat(muslo.l) || null,
    calf_r_cm:    parseFloat(gemelo.r || panto.r) || null,
    calf_l_cm:    parseFloat(gemelo.l || panto.l) || null,
  }
  const hasMeasurements = Object.values(meas).some(v => v !== null)

  return {
    nombre,
    email:        emailFinal,
    emailAuto,
    password:     find(['contrasena', 'contraseña', 'password', 'pass', 'clave']) || autoPass(),
    age:          parseInt(find(['edad', 'age'])) || '',
    height_cm:    parseFloat(find(['altura', 'height', 'talla', 'estatura'])) || '',
    weight:       parseFloat(find(['peso inicial', 'peso actual', 'peso'], ['objetivo', 'meta', 'goal'])) || '',
    weight_goal:  find(['peso objetivo', 'objetivo peso', 'peso meta', 'weight goal']),
    kcal:         parseInt(find(['kcal objetivo', 'kcal', 'calorias', 'calories', 'energia'], ['objetivo'])) || '',
    protein:      parseInt(find(['proteina objetivo', 'proteina', 'protein'])) || '',
    notes:        find(['objetivo principal', 'objetivo', 'notas', 'notes', 'observaciones', 'lesiones', 'nivel actividad']),
    weeks:        parseInt(find(['semanas', 'weeks', 'duracion', 'plan'])) || 12,
    _measurements: hasMeasurements ? meas : null,
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
      ${rows.some(r => r._measurements) ? `<span style="color:var(--green)"> · <i class="ti ti-ruler-2"></i> Medidas corporales detectadas — se importarán automáticamente.</span>` : ''}
    </div>
    ${rows.some(r => r.emailAuto) ? `<div style="font-size:12px;color:var(--amber);background:var(--amber)15;border:1px solid var(--amber)44;border-radius:8px;padding:8px 12px;margin-bottom:10px">
      <i class="ti ti-alert-triangle"></i> El archivo no tiene columna Email. Se ha generado un email provisional (<em>nombre@sinmail.local</em>) — actualízalos desde el perfil de cada cliente tras la importación.
    </div>` : ''}
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
              <td style="padding:6px 8px;color:${r.emailAuto ? 'var(--amber)' : 'var(--text2)'}">${escHtml(r.email)}${r.emailAuto ? ' <i class="ti ti-alert-circle" style="font-size:11px"></i>' : ''}</td>
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
  updateImportProgress(0, rows.length, 'Iniciando...')

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      'https://cwwvwrzqlavuyqhyeepu.supabase.co/functions/v1/bulk-import-clients',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ clients: rows })
      }
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    await loadClients()
    renderImportResults(data.results)
  } catch (err) {
    document.getElementById('import-progress-view').innerHTML = `
      <div style="text-align:center;padding:20px">
        <i class="ti ti-alert-circle" style="font-size:32px;color:var(--red);display:block;margin-bottom:8px"></i>
        <div style="color:var(--red);font-weight:600">Error en la importación</div>
        <div style="font-size:12px;color:var(--text2);margin-top:8px">${escHtml(err.message)}</div>
        <button class="btn" onclick="closeImportModal()" style="margin-top:16px">Cerrar</button>
      </div>
    `
  }
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
  // Store results so the download button can access them without inline JSON
  window._lastImportOk = ok

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
      <button class="btn" onclick="downloadImportResults()" style="width:100%;margin-top:10px;font-size:12px">
        <i class="ti ti-download"></i> Descargar contraseñas temporales (CSV)
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

window.downloadImportResults = function() {
  const rows = window._lastImportOk || []
  if (!rows.length) return
  const esc = v => `"${String(v).replace(/"/g, '""')}"`
  const csv = 'nombre,email,contraseña_temporal\n' + rows.map(r => `${esc(r.nombre)},${esc(r.email)},${esc(r.password)}`).join('\n')
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

function notesCard(fieldId, value, dbColumn, icon, label) {
  return `
  <div class="card" style="margin-bottom:12px">
    <div class="card-title"><i class="ti ${icon}"></i> ${label}</div>
    <div style="display:flex;gap:8px;align-items:flex-start">
      <textarea id="${fieldId}" style="flex:1;min-height:72px;resize:vertical" placeholder="Escribe o dicta las instrucciones para tu cliente...">${escHtml(value || '')}</textarea>
      ${voiceMicBtn(fieldId)}
    </div>
    <button class="btn btn-primary" onclick="saveNotes('${dbColumn}','${fieldId}',this)" style="margin-top:8px;font-size:12px;padding:7px 14px">
      <i class="ti ti-device-floppy"></i> Guardar instrucciones
    </button>
  </div>`
}

window.saveNotes = async function(dbColumn, fieldId, btn) {
  const notes = document.getElementById(fieldId)?.value ?? ''
  const orig = btn.innerHTML
  btn.disabled = true
  btn.innerHTML = '<i class="ti ti-loader-2"></i> Guardando...'

  const { error } = await supabase.from('clients')
    .update({ [dbColumn]: notes })
    .eq('id', SELECTED_CLIENT)

  if (!error) {
    SELECTED_CLIENT_DATA.client[dbColumn] = notes
    btn.innerHTML = '<i class="ti ti-circle-check"></i> ¡Guardado!'
    btn.style.background = 'var(--green)'
    setTimeout(() => {
      btn.innerHTML = orig
      btn.style.background = ''
      btn.disabled = false
    }, 2000)
  } else {
    btn.innerHTML = '<i class="ti ti-alert-circle"></i> Error: ' + error.message
    btn.style.background = 'var(--red)'
    setTimeout(() => {
      btn.innerHTML = orig
      btn.style.background = ''
      btn.disabled = false
    }, 3000)
  }
}

let _activeRecognition = null

window.startVoice = function(targetId, btn) {
  // Toggle: si ya está grabando, parar
  if (_activeRecognition) {
    _activeRecognition.stop()
    _activeRecognition = null
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = '<i class="ti ti-microphone"></i>'
    return
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) { showNotif('Tu navegador no soporta dictado por voz (usa Chrome)'); return }

  const r = new SR()
  r.lang = 'es-ES'
  r.continuous = true
  r.interimResults = false
  _activeRecognition = r

  btn.style.color = 'var(--red)'
  btn.style.borderColor = 'var(--red)'
  btn.innerHTML = '<i class="ti ti-microphone"></i> Escuchando...'

  const reset = () => {
    _activeRecognition = null
    btn.style.color = ''
    btn.style.borderColor = ''
    btn.innerHTML = '<i class="ti ti-microphone"></i>'
  }

  r.onresult = e => {
    const text = Array.from(e.results)
      .filter(res => res.isFinal)
      .map(res => res[0].transcript)
      .join(' ')
    if (!text) return
    const el = document.getElementById(targetId)
    if (el) el.value = (el.value ? el.value + ' ' : '') + text
  }
  r.onerror = e => {
    if (e.error !== 'aborted') showNotif('Error de micrófono: ' + e.error)
    reset()
  }
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

// ─── TAB: CHAT ────────────────────────────────────────────────────────────────

let chatChannel = null
let chatMessages = []
let chatClientId = null

async function renderChatTab(el) {
  const clientId = SELECTED_CLIENT_DATA?.client?.id
  if (!clientId) { el.innerHTML = '<p style="color:var(--text2);padding:16px">Selecciona un cliente.</p>'; return }

  // Si cambia el cliente, limpiar canal anterior
  if (chatClientId !== clientId) {
    chatMessages = []
    chatClientId = clientId
    if (chatChannel) { supabase.removeChannel(chatChannel); chatChannel = null }
  }

  el.innerHTML = `
    <div class="card" style="padding:12px">
      <div class="chat-wrap tall" id="trainer-msg-wrap" style="max-height:480px"></div>
      <div class="chat-input-row" style="margin-top:8px">
        <input type="text" id="trainer-msg-in" placeholder="Escribe un mensaje a ${SELECTED_CLIENT_DATA.client.name || 'tu cliente'}..."
          onkeydown="if(event.key==='Enter')trainerSendMessage()">
        <button class="btn btn-primary" onclick="trainerSendMessage()" style="width:auto;padding:10px 14px"><i class="ti ti-send"></i></button>
      </div>
    </div>
  `

  // Cargar mensajes si no están cargados
  if (chatMessages.length === 0) {
    const { data: msgs } = await supabase
      .from('messages').select('*').eq('client_id', clientId).order('created_at', { ascending: true })
    chatMessages = msgs || []
  }
  trainerRenderMessages()

  // Marcar como leídos
  const unreadIds = chatMessages.filter(m => m.sender_id === clientId && !m.read_at).map(m => m.id)
  if (unreadIds.length) {
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
    chatMessages.forEach(m => { if (unreadIds.includes(m.id)) m.read_at = new Date().toISOString() })
    const badge = document.getElementById('chat-tab-badge'); if (badge) badge.style.display = 'none'
  }

  // Realtime
  if (!chatChannel) {
    chatChannel = supabase.channel('trainer-msgs-' + clientId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` }, payload => {
        chatMessages.push(payload.new)
        trainerRenderMessages()
        if (payload.new.sender_id === clientId) {
          supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', payload.new.id)
        }
      }).subscribe()
  }
}

function trainerRenderMessages() {
  const wrap = document.getElementById('trainer-msg-wrap')
  if (!wrap) return
  if (chatMessages.length === 0) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--text2);font-size:13px"><i class="ti ti-message-circle" style="font-size:32px;display:block;margin-bottom:8px;opacity:.3"></i>Sin mensajes con este cliente.</div>`
    return
  }
  wrap.innerHTML = chatMessages.map(m => {
    const isTrainer = m.sender_id !== chatClientId
    const time = new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    const date = new Date(m.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `<div><div class="msg ${isTrainer ? 'user' : 'trainer'}">${trainerEscapeHtml(m.content)}</div><div class="msg-meta ${isTrainer ? '' : 'left'}">${date} · ${time}</div></div>`
  }).join('')
  wrap.scrollTop = wrap.scrollHeight
}

window.trainerSendMessage = async function() {
  const input = document.getElementById('trainer-msg-in')
  const content = input?.value.trim()
  if (!content || !chatClientId || !TRAINER_ID) return
  input.value = ''

  // Actualización optimista: mostrar mensaje al instante
  const tempMsg = { id: 'tmp-' + Date.now(), client_id: chatClientId, sender_id: TRAINER_ID, content, created_at: new Date().toISOString(), read_at: null }
  chatMessages.push(tempMsg)
  trainerRenderMessages()

  const { data } = await supabase.from('messages').insert({ client_id: chatClientId, sender_id: TRAINER_ID, content }).select().single()
  if (data) {
    const idx = chatMessages.findIndex(m => m.id === tempMsg.id)
    if (idx !== -1) chatMessages[idx] = data
    sendPushToClient(chatClientId, `Mensaje de ${TRAINER_NAME}`, content)
  }
}

function trainerEscapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

async function sendPushToClient(clientId, title, body) {
  try {
    const SUPABASE_URL = 'https://cwwvwrzqlavuyqhyeepu.supabase.co'
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, title, body: body.slice(0, 120), url: '/client.html' })
    })
  } catch (e) {
    console.warn('Push notification failed:', e)
  }
}


// Notificar badge en tab chat cuando llega mensaje nuevo de cualquier cliente
async function checkUnreadMessages() {
  if (!TRAINER_ID) return
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .in('client_id', ALL_CLIENTS.map(c => c.id).filter(Boolean))
  const badge = document.getElementById('chat-tab-badge')
  if (badge) badge.style.display = (count || 0) > 0 ? 'block' : 'none'
}
