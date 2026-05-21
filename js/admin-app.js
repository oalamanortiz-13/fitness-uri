import { supabase } from './supabase-client.js'
import { requireRole, logout } from './auth.js'

let ADMIN_ID = null

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await requireRole('admin')
  if (!auth) return
  ADMIN_ID = auth.session.user.id
  document.getElementById('admin-name').textContent = auth.profile.full_name || auth.session.user.email

  await Promise.all([loadStats(), loadTrainers(), loadAllClients()])

  document.getElementById('loading-screen').style.display = 'none'
  document.getElementById('app').style.display = 'block'
})

window.doLogout = logout

async function loadStats() {
  const [{ count: trainers }, { count: clients }, { count: active }] = await Promise.all([
    supabase.from('trainers').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('active', true),
  ])
  document.getElementById('stat-trainers').textContent = trainers || 0
  document.getElementById('stat-clients').textContent = clients || 0
  document.getElementById('stat-active').textContent = active || 0
}

async function loadTrainers() {
  const { data } = await supabase
    .from('trainers')
    .select('id, specialty, profiles(full_name, email)')

  const el = document.getElementById('trainers-list')
  if (!data?.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Sin preparadores</div>'; return }

  // Count clients per trainer
  const { data: clientCounts } = await supabase
    .from('clients')
    .select('trainer_id')
    .eq('active', true)

  const countMap = {}
  for (const c of (clientCounts || [])) {
    countMap[c.trainer_id] = (countMap[c.trainer_id] || 0) + 1
  }

  el.innerHTML = data.map(t => {
    const name = t.profiles?.full_name || t.profiles?.email || '—'
    const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    return `<div class="row">
      <div class="client-avatar" style="width:36px;height:36px;font-size:14px;margin-right:12px">${initials}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${name}</div>
        <div style="font-size:11px;color:var(--text2)">${t.profiles?.email || ''} · ${t.specialty || 'Sin especialidad'}</div>
      </div>
      <span class="tag">${countMap[t.id] || 0} clientes</span>
    </div>`
  }).join('')
}

async function loadAllClients() {
  const { data } = await supabase
    .from('clients')
    .select('id, active, weight_goal, profiles(full_name, email), trainers(profiles(full_name))')
    .order('active', { ascending: false })

  const el = document.getElementById('all-clients-list')
  if (!data?.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Sin clientes</div>'; return }

  el.innerHTML = data.map(c => {
    const name = c.profiles?.full_name || c.profiles?.email || '—'
    const trainerName = c.trainers?.profiles?.full_name || '—'
    return `<div class="row">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${name}</div>
        <div style="font-size:11px;color:var(--text2)">${c.profiles?.email || ''} · Preparador: ${trainerName}</div>
      </div>
      <span class="badge ${c.active ? 'badge-green' : 'badge-gray'}">${c.active ? 'Activo' : 'Inactivo'}</span>
    </div>`
  }).join('')
}

// ─── NUEVO TRAINER ────────────────────────────────────────────────────────────

window.openNewTrainerModal = function() {
  document.getElementById('new-trainer-modal').classList.add('open')
}

window.closeNewTrainerModal = function() {
  document.getElementById('new-trainer-modal').classList.remove('open')
}

window.createTrainer = async function() {
  const name = document.getElementById('nt-name').value.trim()
  const email = document.getElementById('nt-email').value.trim()
  const password = document.getElementById('nt-password').value
  const specialty = document.getElementById('nt-specialty').value.trim()
  const errEl = document.getElementById('nt-error')
  const btn = document.getElementById('nt-btn')

  if (!name || !email || !password) {
    errEl.textContent = 'Nombre, email y contraseña son obligatorios'
    errEl.style.display = 'block'; return
  }
  if (password.length < 8) {
    errEl.textContent = 'La contraseña debe tener al menos 8 caracteres'
    errEl.style.display = 'block'; return
  }

  btn.textContent = 'Creando...'
  btn.disabled = true
  errEl.style.display = 'none'

  // Guardar sesión del admin antes de signUp
  const { data: { session: adminSession } } = await supabase.auth.getSession()

  // Crear usuario con signUp
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role: 'trainer', full_name: name }
    }
  })

  if (signUpError) {
    errEl.textContent = signUpError.message
    errEl.style.display = 'block'
    btn.textContent = 'Crear preparador'
    btn.disabled = false
    return
  }

  // Restaurar sesión del admin inmediatamente
  await supabase.auth.setSession({
    access_token: adminSession.access_token,
    refresh_token: adminSession.refresh_token
  })

  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id, role: 'trainer', full_name: name, email
    })
    await supabase.from('trainers').upsert({
      id: data.user.id, specialty: specialty || null
    })
    // Confirmar email automáticamente via update
    await supabase.auth.admin?.updateUserById?.(data.user.id, { email_confirm: true })
  }

  closeNewTrainerModal()
  await Promise.all([loadStats(), loadTrainers()])
  showNotif('Preparador creado correctamente ✓')
  btn.textContent = 'Crear preparador'
  btn.disabled = false
}

function showNotif(msg) {
  const n = document.createElement('div')
  n.style.cssText = 'position:fixed;top:16px;right:16px;background:var(--blue);color:#fff;border-radius:12px;padding:12px 16px;font-size:13px;z-index:400;animation:fadeIn .3s'
  n.textContent = msg
  document.body.appendChild(n)
  setTimeout(() => n.remove(), 3500)
}
