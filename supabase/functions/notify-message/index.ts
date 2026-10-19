// supabase/functions/notify-message/index.ts
//
// Fires when a BOARDER sends a message (the trigger on public.messages only
// calls us when sender_id = boarder_id). Like notify-submission, it's called by
// the database via pg_net, not by a signed-in user, so we verify a shared
// secret header instead of a login token.
//
// For each barn person who should hear about boarder messages, we mint a
// reply-link token, store only its hash, and text them the link. Tapping it
// opens /r/<token>, where reply_via_token() lets them answer without logging in.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendSms } from '../_shared/sms.ts'
import { appUrl } from '../_shared/config.ts'

// If a recipient already got a link for this boarder's thread in the last
// 15 minutes and hasn't used it yet, don't text them again: that link already
// shows the newest messages when opened.
const DEBOUNCE_MINUTES = 15

// 32 random bytes, URL-safe base64 (~43 chars). Unguessable; travels only in the SMS.
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// MUST match resolve_reply_token() in SQL:
//   encode(sha256(convert_to(token, 'UTF8')), 'hex')
// i.e. SHA-256 of the token's UTF-8 bytes, as lowercase hex.
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // 1. Only our own database may call this. Same secret as notify-submission:
  //    both mean "this request came from our trigger".
  const expected = Deno.env.get('WEBHOOK_SECRET')
  const provided = req.headers.get('x-webhook-secret')
  if (!expected || provided !== expected) {
    return json({ error: 'Unauthorized' }, 401)
  }

  try {
    const { message_id } = await req.json()
    if (!message_id) {
      return json({ error: 'Missing message_id' }, 400)
    }

    // Service-role client: server-side only, never shipped to the browser.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    // 2. Re-read the message ourselves rather than trusting the request body.
    const { data: msg } = await admin
      .from('messages')
      .select('id, boarder_id, sender_id')
      .eq('id', message_id)
      .single()

    if (!msg) {
      console.warn('notify-message: message not found', message_id)
      return json({ skipped: 'message not found' })
    }

    // Defense in depth: the trigger already filters, but never text the barn
    // about its own replies (including replies sent through a reply link).
    if (msg.sender_id !== msg.boarder_id) {
      return json({ skipped: 'not a boarder message' })
    }

    const { data: boarder } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', msg.boarder_id)
      .single()
    const boarderName = boarder?.full_name?.trim() || 'a boarder'

    // 3. Who should hear about it: barn people the admins routed in, who have
    //    also consented to texts. (sendSms re-checks consent; filtering here
    //    just avoids minting tokens for people we won't text.)
    const { data: recipients, error: recErr } = await admin
      .from('profiles')
      .select('id')
      .eq('notify_boarder_messages', true)
      .eq('receives_sms', true)
      .in('role', ['admin', 'staff'])

    if (recErr) throw recErr
    if (!recipients?.length) {
      return json({ skipped: 'no recipients' })
    }

    const since = new Date(Date.now() - DEBOUNCE_MINUTES * 60_000).toISOString()

    // 4. One recipient at a time is independent; allSettled so one failure
    //    never blocks the rest.
    const results = await Promise.allSettled(
      recipients.map(async ({ id: recipientId }) => {
        // Debounce: an unused, live link for this thread sent in the last 15 min.
        const { data: recent } = await admin
          .from('message_reply_tokens')
          .select('id')
          .eq('recipient_id', recipientId)
          .eq('boarder_id', msg.boarder_id)
          .is('revoked_at', null)
          .is('last_used_at', null)
          .gt('created_at', since)
          .limit(1)

        if (recent?.length) {
          return { recipientId, outcome: 'debounced' }
        }

        // Mint the token; only the hash is stored.
        const token = newToken()
        const { data: row, error: tokErr } = await admin
          .from('message_reply_tokens')
          .insert({
            token_hash: await sha256Hex(token),
            recipient_id: recipientId,
            boarder_id: msg.boarder_id,
            source_message_id: msg.id,
          })
          .select('id')
          .single()
        if (tokErr || !row) throw tokErr ?? new Error('token insert failed')

        // Matches the sample registered with the campaign (and shown on /about).
        const sent = await sendSms(admin, {
          recipientId,
          kind: 'boarder_message',
          messageId: msg.id,
          text: `New message from ${boarderName}. View and reply: ${appUrl(`/r/${token}`)}`,
        })

        if (!sent.ok) {
          // The text never went out, so retire the token: otherwise it would
          // count as "recently notified" and suppress the next attempt.
          await admin
            .from('message_reply_tokens')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', row.id)
          return { recipientId, outcome: 'skipped' in sent ? sent.skipped : 'failed' }
        }

        return { recipientId, outcome: 'sent' }
      }),
    )

    // 5. Always 200 with a summary (a skipped recipient isn't a failure of
    //    this call, and pg_net would otherwise record an error).
    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { outcome: 'error', error: String(r.reason?.message ?? r.reason) }
    )
    for (const s of summary) if (s.outcome === 'error') console.error('notify-message:', s)

    return json({ message_id: msg.id, results: summary })
  } catch (err) {
    console.error('notify-message error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})