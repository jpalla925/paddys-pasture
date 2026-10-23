// supabase/functions/notify-sms-opt-in/index.ts
//
// Sends the opt-in confirmation text promised in the A2P campaign when
// someone opts in on the web. Called by the sms_opt_in_confirm trigger on
// public.profiles (migration 161033) via pg_net -- not by a signed-in user --
// so, like notify-message, we verify the shared webhook secret header.
//
// The wording lives in _shared/sms.ts (OPT_IN_CONFIRMATION), not here, so it
// sits next to the prefix/suffix rules it has to agree with.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendSms } from '../_shared/sms.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // 1. Only our own database may call this.
  const expected = Deno.env.get('WEBHOOK_SECRET')
  const provided = req.headers.get('x-webhook-secret')
  if (!expected || provided !== expected) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { profile_id } = await req.json()
    if (!profile_id) {
      return json({ error: 'Missing profile_id' }, 400)
    }

    // Service-role client: server-side only, never shipped to the browser.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    // 2. sendSms re-reads the profile and re-checks receives_sms itself, so we
    //    don't trust the request beyond "which person". If the person texted
    //    STOP earlier, Twilio still blocks the number (error 21610) and the
    //    failure is recorded in sms_log -- expected, not a bug.
    const sent = await sendSms(admin, {
      recipientId: profile_id,
      kind: 'opt_in_confirmation',
    })

    // 3. Always 200 with a summary, like notify-message: a skip isn't a
    //    failure of this call, and pg_net would otherwise record an error.
    if (!sent.ok && 'error' in sent) {
      console.error('notify-sms-opt-in: send failed', profile_id, sent.error)
    }
    return json({ profile_id, result: sent })
  } catch (err) {
    console.error('notify-sms-opt-in error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})