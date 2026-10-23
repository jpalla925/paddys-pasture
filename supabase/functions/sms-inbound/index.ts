// supabase/functions/sms-inbound/index.ts
//
// Twilio calls this when someone texts our 10DLC number (Messaging Service ->
// Integration -> "Send a webhook"). Its one job today: when the text is a STOP
// keyword, record it in profiles.sms_opt_out_at so receives_sms stays truthful.
//
// Twilio has ALREADY handled the STOP before we hear about it: Advanced
// Opt-Out sent the "you're unsubscribed" reply and blocks future texts to that
// number. We're only bringing our database in line with that.
//
// Who may call this: only Twilio. The URL is public, so we verify Twilio's
// signature (X-Twilio-Signature) instead of a login token or our webhook secret.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// An empty TwiML reply = "don't send anything back". Advanced Opt-Out already
// sent the auto-reply; a reply from us would be a second text.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const twiml = () =>
  new Response(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } })

// The exact public URL entered in the Twilio console. Twilio signs THIS
// string, so we must rebuild it ourselves: inside Supabase, req.url is an
// internal address, not the one Twilio called. No trailing slash, no query.
function publicUrl(): string {
  const base = Deno.env.get('SUPABASE_URL')!.replace(/\/+$/, '')
  return `${base}/functions/v1/sms-inbound`
}

// ---------------------------------------------------------------------------
// Twilio request signature
//
// For a form POST, Twilio builds one string: the URL, then every form field
// sorted by name, each written as name immediately followed by value, no
// separators. It signs that string with HMAC-SHA1 using the account Auth Token
// as the key, base64-encodes the result, and sends it as X-Twilio-Signature.
//
// We repeat the same steps with our copy of the Auth Token. Matching output
// proves (a) the sender knows the Auth Token, i.e. it's Twilio, and (b) no
// field was changed in transit, since any change gives a different signature.
// ---------------------------------------------------------------------------
async function expectedSignature(authToken: string, url: string, params: URLSearchParams): Promise<string> {
  const names = [...new Set(params.keys())].sort()
  let data = url
  for (const name of names) {
    for (const value of params.getAll(name)) data += name + value
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  let bin = ''
  for (const b of sig) bin += String.fromCharCode(b)
  return btoa(bin)
}

// Compare every character even after a mismatch. A normal === stops at the
// first wrong character, and the time that takes can leak how much of a
// forged signature was right.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Twilio sends E.164 (+19415551234); profiles store 10 bare digits.
// Only US numbers can reach a 10DLC number in practice; anything else -> null.
function toStoredDigits(e164: string | null): string | null {
  const digits = (e164 ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // 1. Verify the signature before trusting anything in the body.
  //    Missing secret is a setup bug: fail loudly (500) rather than accept
  //    unverified requests.
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!authToken) {
    console.error('sms-inbound: TWILIO_AUTH_TOKEN is not set')
    return new Response('Server misconfigured', { status: 500 })
  }

  const params = new URLSearchParams(await req.text())
  const provided = req.headers.get('x-twilio-signature') ?? ''
  const expected = await expectedSignature(authToken, publicUrl(), params)

  if (!constantTimeEqual(provided, expected)) {
    console.warn('sms-inbound: rejected request with invalid signature')
    return new Response('Forbidden', { status: 403 })
  }

  // 2. What kind of text is this? OptOutType is added by Advanced Opt-Out
  //    when the body matches a keyword on the Messaging Service's Opt-out /
  //    Opt-in / Help tabs, so that console list stays the single source of
  //    truth for keywords. Ordinary texts have no OptOutType.
  const optOutType = params.get('OptOutType')        // 'STOP' | 'START' | 'HELP' | null
  const messageSid = params.get('MessageSid')

  if (optOutType !== 'STOP') {
    // START/HELP: Twilio already replied. Logged so we can see whether START
    // ever happens before deciding to record it (decided Oct 23, 2026).
    // Ordinary texts: nothing to do; the reply path is the link, not SMS.
    // The message body is deliberately not logged.
    console.info('sms-inbound: no action', { optOutType: optOutType ?? 'none', messageSid })
    return twiml()
  }

  // 3. Record the STOP on every profile with this phone number. STOP applies
  //    to a NUMBER, not an account, so two profiles sharing a phone both opt
  //    out. Service role is required: the guard in migration 161033 blocks
  //    every signed-in caller from writing sms_opt_out_at.
  const phone = toStoredDigits(params.get('From'))
  if (!phone) {
    console.warn('sms-inbound: STOP from a number we cannot match', { messageSid })
    return twiml()
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SERVICE_ROLE_KEY')!,
  )

  const { data: updated, error } = await admin
    .from('profiles')
    .update({ sms_opt_out_at: new Date().toISOString() })
    .eq('phone', phone)
    .select('id')

  if (error) {
    // 500 shows up in Twilio's error log (11200), so a failed write is visible.
    // Twilio's own block on the number still protects the person meanwhile.
    console.error('sms-inbound: failed to record STOP', { messageSid, error: error.message })
    return new Response('Failed to record opt-out', { status: 500 })
  }

  console.info('sms-inbound: recorded STOP', {
    messageSid,
    profiles: updated?.map((p) => p.id) ?? [],
  })
  return twiml()
})