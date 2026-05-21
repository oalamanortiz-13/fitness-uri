import { supabase } from './supabase-client.js'

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getRole(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', userId)
    .single()
  return data
}

export function redirectByRole(role) {
  const routes = { admin: '/admin.html', trainer: '/trainer.html', client: '/client.html' }
  window.location.href = routes[role] || '/index.html'
}

export async function requireRole(expectedRole) {
  const session = await getSession()
  if (!session) { window.location.href = '/index.html'; return null }
  const profile = await getRole(session.user.id)
  if (!profile) { window.location.href = '/index.html'; return null }
  if (profile.role !== expectedRole) { redirectByRole(profile.role); return null }
  return { session, profile }
}

export async function logout() {
  await supabase.auth.signOut()
  window.location.href = '/index.html'
}
