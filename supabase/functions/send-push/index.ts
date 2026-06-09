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

    await sendWebPush(
      row.subscription,
      JSON.stringify({ title: title || 'Tu Preparador', body: body || '', url: url || '/client.html' }),
      vapidPublicKey,
      vapidPrivateKey
    )

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// ── VAPID push sin dependencias externas ─────────────────────────────────────

function b64urlToBytes(b64: string): Uint8Array {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0))
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function signJwt(claims: object, privateKeyBytes: Uint8Array): Promise<string> {
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body   = bytesToB64url(new TextEncoder().encode(JSON.stringify(claims)))
  const input  = `${header}.${body}`

  // Import raw P-256 private key scalar → JWK form
  const d = bytesToB64url(privateKeyBytes)
  // Derive public key from private to build JWK (not needed for signing but required by importKey)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    buildPkcs8(privateKeyBytes),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input)
  )
  return `${input}.${bytesToB64url(new Uint8Array(sig))}`
}

// Build minimal PKCS8 DER wrapper around raw P-256 private key scalar
function buildPkcs8(rawPriv: Uint8Array): ArrayBuffer {
  // RFC 5915 ECPrivateKey wrapped in PKCS8
  const ecPriv = new Uint8Array([
    0x30, 0x77,           // SEQUENCE
      0x02, 0x01, 0x01,   // INTEGER version=1
      0x04, 0x20, ...rawPriv, // OCTET STRING (32 bytes)
      0xa0, 0x0a,         // [0] OID tag
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // prime256v1
      0xa1, 0x44,         // [1] public key tag
        0x03, 0x42, 0x00, // BIT STRING (will be filled below)
        ...new Uint8Array(65) // placeholder, not needed for signing
  ])

  const pkcs8 = new Uint8Array([
    0x30, 0x81, 0x87,  // SEQUENCE
      0x02, 0x01, 0x00, // INTEGER version=0
      0x30, 0x13,       // SEQUENCE (algorithm)
        0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // ecPublicKey OID
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // prime256v1
      0x04, 0x6d,       // OCTET STRING (ECPrivateKey)
        0x30, 0x6b,     // SEQUENCE
          0x02, 0x01, 0x01, // version=1
          0x04, 0x20, ...rawPriv, // private key
          0xa0, 0x0a,
            0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  ])
  return pkcs8.buffer
}

async function encryptPayload(payload: string, sub: { keys: { p256dh: string, auth: string } }) {
  const clientPubKey = b64urlToBytes(sub.keys.p256dh)  // 65 bytes
  const authSecret   = b64urlToBytes(sub.keys.auth)    // 16 bytes

  // Generate ephemeral P-256 key pair
  const ephKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPubRaw  = new Uint8Array(await crypto.subtle.exportKey('raw', ephKeyPair.publicKey))

  // Import client public key
  const clientKey = await crypto.subtle.importKey('raw', clientPubKey, { name: 'ECDH', namedCurve: 'P-256' }, false, [])

  // ECDH shared secret
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, ephKeyPair.privateKey, 256))

  // Salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF to derive PRK
  const enc = new TextEncoder()
  const ikm = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveBits'])

  // prk = HKDF-Extract(auth_secret, ecdh_secret)
  const prkKey = await crypto.subtle.importKey('raw', sharedBits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prkHmac = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, concat(authSecret, enc.encode('Content-Encoding: auth\0\x01'))))

  const prk = await crypto.subtle.importKey('raw', prkHmac, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  // cek_info = "Content-Encoding: aesgcm" + 0x00 + keyinfo
  const keyInfo = concat(
    enc.encode('Content-Encoding: aesgcm\0'),
    new Uint8Array([0x00, 0x41]), ephPubRaw,
    new Uint8Array([0x00, 0x41]), clientPubKey,
  )
  const nonceInfo = concat(
    enc.encode('Content-Encoding: nonce\0'),
    new Uint8Array([0x00, 0x41]), ephPubRaw,
    new Uint8Array([0x00, 0x41]), clientPubKey,
  )

  const cekHmac   = new Uint8Array(await crypto.subtle.sign('HMAC', prk, concat(salt, keyInfo,   enc.encode('\x01'))))
  const nonceHmac = new Uint8Array(await crypto.subtle.sign('HMAC', prk, concat(salt, nonceInfo, enc.encode('\x01'))))

  const cek   = cekHmac.slice(0, 16)
  const nonce = nonceHmac.slice(0, 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])

  // Pad payload (2-byte length prefix)
  const payloadBytes = enc.encode(payload)
  const padded = concat(new Uint8Array([0x00, 0x00]), payloadBytes)

  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded))

  return { ciphertext, salt, ephPubRaw }
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

async function sendWebPush(subscription: any, payload: string, vapidPublicKey: string, vapidPrivateKey: string) {
  const endpoint = subscription.endpoint
  const origin   = new URL(endpoint).origin
  const exp      = Math.floor(Date.now() / 1000) + 12 * 3600

  const privBytes = b64urlToBytes(vapidPrivateKey)
  const jwt = await signJwt({ aud: origin, exp, sub: 'mailto:info@tupreparador.es' }, privBytes)

  const { ciphertext, salt, ephPubRaw } = await encryptPayload(payload, subscription)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      'Content-Encoding': 'aesgcm',
      'Content-Type': 'application/octet-stream',
      'Encryption': `salt=${bytesToB64url(salt)}`,
      'Crypto-Key': `dh=${bytesToB64url(ephPubRaw)}`,
      'TTL': '86400',
    },
    body: ciphertext
  })

  if (!res.ok && res.status !== 201) {
    const txt = await res.text()
    throw new Error(`Push endpoint error ${res.status}: ${txt.slice(0, 200)}`)
  }
}
