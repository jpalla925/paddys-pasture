// supabase/functions/_shared/sms.ts
// Single source of truth for outbound SMS, the way email.ts is for email.
//
// Every text the app sends goes through sendSms(), which enforces the promises
// made in the Twilio A2P campaign so no future feature can skip them:
//   * only text people whose profile says receives_sms = true
//   * every message starts with "Paddy's Pastures:" and ends with opt-out language
//   * every attempted send is recorded in sms_log (success or failure)
//
// Callers pass a person (recipientId) and the middle of the message; this file
// looks up their phone, checks consent, formats, sends, and logs.
//
// Exception: the opt-in confirmation's wording is fixed here (see
// OPT_IN_CONFIRMATION), so callers send that kind with no text at all.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Must match the check constraint on sms_log.kind.
export type SmsKind = 'boarder_message' | 'opt_in_confirmation'

// A "discriminated union": which fields are allowed depends on `kind`.
// TypeScript rejects text on an opt-in confirmation and requires it on a
// boarder message, so the rule is checked before the code even deploys.
type SendSmsArgs =
  | {
      recipientId: string        // profiles.id of the person to text
      kind: 'boarder_message'
      text: string               // the middle of the message; prefix/suffix are added here
      messageId?: string | null  // messages.id this text is about, if any
    }
  | {
      recipientId: string
      kind: 'opt_in_confirmation'
      messageId?: null
    }

export type SendSmsResult =
  | { ok: true; sid: string }
  | { ok: false; skipped: 'not_opted_in' | 'no_valid_phone' }
  | { ok: false; error: string }

const PREFIX = "Paddy's Pastures: "
const OPT_OUT = ' \n\nReply STOP to opt out.'

// The opt-in confirmation registered with the A2P campaign, word for word,
// minus the PREFIX (composeBody adds it). Must stay identical to the Opt-in
// "Confirmation message" on the Messaging Service's Opt-out tab, so a person
// gets the same text whether they opt in on the web or by texting START.
// It already carries HELP and STOP language, so it gets no OPT_OUT suffix.
const OPT_IN_CONFIRMATION =
  "You're subscribed to barn notifications. Msg frequency varies. " +
  'Msg & data rates may apply. Reply HELP for help, STOP to opt out.'

// Phones are stored as 10 bare digits (ChangePassword.jsx enforces that).
// Twilio wants E.164 (+1XXXXXXXXXX). The stored digits stay the source of
// truth; E.164 is derived here, at the one place that needs it.
export function toE164(stored: string | null | undefined): string | null {
  const digits = (stored ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// Plain SMS (GSM-7) fits 160 chars per segment. One curly quote or dash
// silently switches the WHOLE message to UCS-2 (70 chars per segment), which
// costs more and can split a text in two. Phones auto-insert these when people
// type, so straighten the common ones.
export function toGsmFriendly(s: string): string {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
}

// Every text gets PREFIX and opt-out language; only the source of the
// opt-out language differs. Callers can't turn either off.
export function composeBody(args: SendSmsArgs): string {
  if (args.kind === 'opt_in_confirmation') {
    return toGsmFriendly(PREFIX + OPT_IN_CONFIRMATION)
  }
  return toGsmFriendly(PREFIX + args.text.trim() + OPT_OUT)
}

// Missing secrets are a setup bug, so they throw (like email.ts).
function twilioConfig() {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const keySid = Deno.env.get('TWILIO_API_KEY_SID')
  const keySecret = Deno.env.get('TWILIO_API_KEY_SECRET')
  const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')
  if (!accountSid || !keySid || !keySecret || !messagingServiceSid) {
    throw new Error('Twilio secrets are not set (TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_MESSAGING_SERVICE_SID)')
  }
  return { accountSid, keySid, keySecret, messagingServiceSid }
}

// `admin` must be a service-role client: it reads any profile and writes sms_log.
// Twilio/network failures RETURN { ok: false } instead of throwing, so one bad
// number never stops a fan-out to the other recipients.
export async function sendSms(
  admin: SupabaseClient,
  args: SendSmsArgs,
): Promise<SendSmsResult> {
  // Kept whole (not destructured) so composeBody() sees which kind it is;
  // `text` only exists on some kinds.
  const { recipientId, kind } = args
  const messageId = args.messageId ?? null
  const cfg = twilioConfig()

  // 1. Consent check, from the database -- never from the caller.
  const { data: person, error: personErr } = await admin
    .from('profiles')
    .select('phone, receives_sms')
    .eq('id', recipientId)
    .single()

  if (personErr || !person?.receives_sms) {
    console.info('sms: skipped, not opted in', recipientId)
    return { ok: false, skipped: 'not_opted_in' }
  }

  const to = toE164(person.phone)
  if (!to) {
    console.warn('sms: skipped, no valid phone', recipientId)
    return { ok: false, skipped: 'no_valid_phone' }
  }

  // 2. Send. Basic auth with the API key (revocable), not the account Auth Token.
  //    MessagingServiceSid lets Twilio pick the sender from the 10DLC pool tied
  //    to the approved campaign.
  let result: SendSmsResult
  let status = 'failed'
  let errorCode: string | null = null
  let errorMessage: string | null = null
  let sid: string | null = null

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${cfg.keySid}:${cfg.keySecret}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          MessagingServiceSid: cfg.messagingServiceSid,
          Body: composeBody(args),
        }),
      },
    )
    const json = await resp.json().catch(() => ({}))

    if (resp.ok && json.sid) {
      sid = json.sid
      status = json.status ?? 'queued'
      result = { ok: true, sid: json.sid }
    } else {
      errorCode = json.code != null ? String(json.code) : String(resp.status)
      errorMessage = json.message ?? `Twilio HTTP ${resp.status}`
      console.error('sms: Twilio error', recipientId, errorCode, errorMessage)
      result = { ok: false, error: errorMessage! }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err)
    console.error('sms: network error', recipientId, errorMessage)
    result = { ok: false, error: errorMessage }
  }

  // 3. Log the attempt. No body stored on purpose: boarder-message texts carry
  //    a live reply link. A logging failure must not hide a send that happened.
  const { error: logErr } = await admin.from('sms_log').insert({
    recipient_id: recipientId,
    to_phone: to,
    kind,
    message_id: messageId,
    twilio_sid: sid,
    status,
    error_code: errorCode,
    error_message: errorMessage,
  })
  if (logErr) console.error('sms: failed to write sms_log', logErr.message)

  return result
}