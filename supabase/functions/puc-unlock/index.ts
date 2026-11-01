// puc-unlock — server-side 4-digit PIN verification for PUC Center Manager.
//
// The browser never receives the PIN hash or the Supabase account password.
// Configure these secrets (Supabase Dashboard → Edge Functions → Secrets,
// or `supabase secrets set NAME=value`):
//
//   PIN_VERIFIER   "saltHex:pbkdf2Hex" produced by `npm run pin:hash`
//   APP_EMAIL      the authorized Supabase account email
//   APP_PASSWORD   that account's password
//
// A correct PIN is exchanged for a normal Supabase Auth session (password
// grant), so Row Level Security and the puc_authorized_users allow-list keep
// protecting the database exactly as before.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Best-effort throttle per function isolate. It slows guessing and resets on
// a cold start; it is not a substitute for keeping the PIN private.
let failedAttempts = 0
let lockedUntil = 0

const encoder = new TextEncoder()
const ITERATIONS = 100_000

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Length-independent-ish constant comparison of two hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifyPin(pin: string, verifier: string): Promise<boolean> {
  const sep = verifier.indexOf(':')
  if (sep < 1) return false
  const salt = hexToBytes(verifier.slice(0, sep))
  const expected = verifier.slice(sep + 1).toLowerCase()
  if (!salt || !/^[0-9a-f]+$/.test(expected)) return false
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      key,
      256,
    )
    const actual = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return timingSafeEqualHex(actual, expected)
  } catch {
    return false
  }
}

function publishableApiKey(): string {
  const publishable = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (publishable) {
    try {
      const parsed = JSON.parse(publishable)
      if (parsed?.default) return String(parsed.default)
    } catch {
      /* fall through to the legacy anon key */
    }
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const now = Date.now()
    if (now < lockedUntil) {
      const wait = Math.ceil((lockedUntil - now) / 1000)
      return json({ error: `Too many attempts. Try again in ${wait} second${wait === 1 ? '' : 's'}.` }, 429)
    }

    let pin: unknown = ''
    try {
      pin = ((await req.json()) as { pin?: unknown }).pin
    } catch {
      pin = ''
    }
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return json({ error: 'Enter all 4 digits of the PIN.' }, 400)
    }

    const verifier = Deno.env.get('PIN_VERIFIER')
    const appEmail = Deno.env.get('APP_EMAIL')
    const appPassword = Deno.env.get('APP_PASSWORD')
    if (!verifier || !appEmail || !appPassword) {
      return json(
        { error: 'The unlock service is missing its configuration. Complete the PIN setup steps in README.md.' },
        500,
      )
    }

    if (!(await verifyPin(pin, verifier))) {
      failedAttempts += 1
      if (failedAttempts >= 8) {
        failedAttempts = 0
        lockedUntil = Date.now() + 5 * 60_000
        return json({ error: 'Too many attempts. Try again in 5 minutes.' }, 429)
      }
      // Slow each guess down.
      await new Promise((resolve) => setTimeout(resolve, Math.min(failedAttempts * 400, 2400)))
      return json({ error: 'Incorrect PIN.' }, 401)
    }

    failedAttempts = 0
    lockedUntil = 0

    // Correct PIN: exchange the app account credentials (kept only in these
    // secrets) for a normal Supabase Auth session. They never reach the browser.
    const apiKey = publishableApiKey()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!apiKey || !supabaseUrl) {
      return json({ error: 'The unlock service environment is incomplete.' }, 500)
    }

    const tokenResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: appEmail, password: appPassword }),
    })
    if (!tokenResponse.ok) {
      return json(
        {
          error:
            'The unlock service could not open a session. Check the APP_EMAIL and APP_PASSWORD secrets and confirm the user in Supabase Authentication.',
        },
        502,
      )
    }
    const session = (await tokenResponse.json()) as {
      access_token?: string
      refresh_token?: string
      expires_at?: number
    }
    if (!session.access_token || !session.refresh_token) {
      return json({ error: 'The unlock service received an invalid session response.' }, 502)
    }
    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
    })
  } catch {
    return json({ error: 'Unexpected unlock error.' }, 500)
  }
})
