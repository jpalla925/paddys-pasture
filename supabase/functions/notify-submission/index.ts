// supabase/functions/notify-submission/index.ts
//
// Fires when a boarder submits a horse (boarder_completed goes false -> true).
// Unlike create-user and send-email, this function is NOT called by a
// signed-in user — it's called by the database itself, via a trigger using
// pg_net. So there's no login token to check and no browser CORS preflight to
// answer. Instead we verify a shared secret header, then send the
// "new horse submitted" email to the barn.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'

// Where the notification goes. This isn't a secret (it's already the reply-to
// in _shared/email.ts) — we read it from the environment only so the barn can
// change it later, when they own the infrastructure, without a code change.
const NOTIFY_TO = Deno.env.get('NOTIFY_TO') ?? 'howdy@paddyspastures.com'

// The app, so the email can link straight back in.
const APP_URL = 'https://paddyspasture.netlify.app'

Deno.serve(async (req) => {
  // Only the database should be POSTing here.
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // 1. Confirm the call really came from our trigger, not a stranger who found
  //    the URL. The trigger sends this header; we compare it to the secret
  //    stored in the function's environment.
  const expected = Deno.env.get('WEBHOOK_SECRET')
  const provided = req.headers.get('x-webhook-secret')
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    // 2. The trigger sends only the horse's id. We look everything else up
    //    ourselves, so the email is built from trusted database data rather
    //    than from whatever happened to be in the request body.
    const { horse_id } = await req.json()
    if (!horse_id) {
      return new Response(JSON.stringify({ error: 'Missing horse_id' }), { status: 400 })
    }

    // Service-role client: server-side only, never shipped to the browser.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!
    )

    // 3. Read the horse.
    const { data: horse, error: horseErr } = await admin
      .from('horses')
      .select('name, owner_id')
      .eq('id', horse_id)
      .single()
    if (horseErr || !horse) {
      // Nothing to notify about (e.g. the row was deleted). Not an error —
      // return 200 so pg_net doesn't record a failure.
      console.warn('notify-submission: horse not found', horse_id, horseErr?.message)
      return new Response(JSON.stringify({ skipped: 'horse not found' }), { status: 200 })
    }

    // 4. Read the owner (the horses row only carries owner_id).
    const { data: owner } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', horse.owner_id)
      .single()

    const ownerName = owner?.full_name || 'A boarder'
    const ownerEmail = owner?.email || 'no email on file'
    const submittedAt = new Date().toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    })

    // 5. Build and send the email, reusing the shared helper so the from
    //    address and the Resend call stay in exactly one place.
    const html = `
      <div style="font-family: sans-serif; color: #22302a; max-width: 500px;">
        <h2 style="color: #2F4A3D;">🐴 New horse submitted</h2>
        <p><strong>${ownerName}</strong> just submitted a horse profile.</p>
        <p style="line-height: 1.6;">
          <strong>Horse:</strong> ${horse.name}<br>
          <strong>Owner:</strong> ${ownerName} (${ownerEmail})<br>
          <strong>Submitted:</strong> ${submittedAt}
        </p>
        <p>It's now waiting in the <em>new boarded horses</em> queue for the
        barn-side details (stall, hay, grain, pasture, turnout).</p>
        <p><a href="${APP_URL}" style="color: #2F4A3D;">Open Paddy's Pastures</a></p>
      </div>
    `

    const { id } = await sendEmail({
      to: NOTIFY_TO,
      subject: `New horse submitted: ${horse.name}`,
      html,
    })

    return new Response(JSON.stringify({ success: true, id }), { status: 200 })
  } catch (err) {
    console.error('notify-submission error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})