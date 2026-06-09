import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { client_id, title, body, url } = await req.json()
    if (!client_id) throw new Error('client_id requerido')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: row } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('client_id', client_id)
      .single()

    if (!row?.subscription) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')!
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
    const vapidSubject    = Deno.env.get('VAPID_SUBJECT') || 'mailto:oalamanortiz@gmail.com'

    await sendWebPush(
      row.subscription,
      JSON.stringify({ title: title || 'Tu Preparador', body: body || '', url: url || '/client.html' }),
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject,
    )

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-push error:', (err as Error).message)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64urlToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0))
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────────────────────

async function signJwt(claims: object, privKeyBytes: Uint8Array): Promise<string> {
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify(claims)))
  const input = `${header}.${payload}`

  const pkcs8 = buildPkcs8(privKeyBytes)
  const key = await crypto.subtle.importKey(
    'pkcs8', pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input))
  return `${input}.${bytesToB64url(new Uint8Array(sig))}`
}

function buildPkcs8(rawPriv: Uint8Array): ArrayBuffer {
  const pkcs8 = new Uint8Array([
    0x30, 0x81, 0x87,
    0x02, 0x01, 0x00,
    0x30, 0x13,
      0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x6d,
      0x30, 0x6b,
        0x02, 0x01, 0x01,
        0x04, 0x20, ...rawPriv,
        0xa0, 0x0a,
          0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  ])
  return pkcs8.buffer
}

// ── RFC 8291 + RFC 8188: aes128gcm Web Push Encryption ───────────────────────

async function hmacSha256(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, msg))
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  return hmacSha256(salt, ikm)
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  // T(1) = HMAC(PRK, info || 0x01) — sufficient for len ≤ 32
  const t1 = await hmacSha256(prk, concat(info, new Uint8Array([0x01])))
  return t1.slice(0, len)
}

async function encryptPayload(payload: string, sub: { endpoint: string, keys: { p256dh: string, auth: string } }): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const uaPublic   = b64urlToBytes(sub.keys.p256dh)  // 65 bytes uncompressed
  const authSecret = b64urlToBytes(sub.keys.auth)    // 16 bytes

  // Ephemeral application server key pair
  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic  = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey))

  // ECDH shared secret
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeyPair.privateKey, 256))

  // RFC 8291 §3.2
  // PRK_key = HKDF-Extract(salt=auth_secret, ikm=ecdh_secret)
  const prkKey = await hkdfExtract(authSecret, ecdhSecret)

  // key_info = "WebPush: info\0" || ua_public || as_public
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic)
  // IKM = HKDF-Expand(PRK_key, key_info, 32)
  const ikm = await hkdfExpand(prkKey, keyInfo, 32)

  // RFC 8188: random salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // PRK = HKDF-Extract(salt=salt, ikm=IKM)
  const prk = await hkdfExtract(salt, ikm)

  // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
  const cek   = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\0'), 12)

  // Encrypt: plaintext || 0x02 (last-record delimiter)
  const plaintext = concat(enc.encode(payload), new Uint8Array([0x02]))
  const aesKey    = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext))

  // RFC 8188 header: salt(16) || rs(4 BE) || idlen(1) || keyid(asPublic 65B)
  const rs = 4096
  const header = new Uint8Array(21 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs, false) // big-endian
  header[20] = asPublic.length
  header.set(asPublic, 21)

  return concat(header, ciphertext)
}

// ── sendWebPush ───────────────────────────────────────────────────────────────

async function sendWebPush(
  subscription: any,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
) {
  const endpoint = subscription.endpoint
  const origin   = new URL(endpoint).origin
  const exp      = Math.floor(Date.now() / 1000) + 12 * 3600

  const jwt  = await signJwt({ aud: origin, exp, sub: vapidSubject }, b64urlToBytes(vapidPrivateKey))
  const body = await encryptPayload(payload, subscription)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type':     'application/octet-stream',
      'TTL':              '86400',
    },
    body,
  })

  if (!res.ok && res.status !== 201) {
    const txt = await res.text()
    throw new Error(`Push endpoint ${res.status}: ${txt.slice(0, 300)}`)
  }
}
