// supabase/functions/_shared/email.ts
// Single source of truth for outbound transactional email.
// Both create-user (boarder welcome) and send-email (care notification)
// send through here, so the from address, reply-to, and the Resend call
// itself all live in exactly one place.

const FROM = 'Paddy\'s Pastures <noreply@paddyspastures.com>'
const REPLY_TO = 'Howdy@paddyspastures.com'

interface SendEmailArgs {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<{ id: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      reply_to: REPLY_TO,
      to,
      subject,
      html,
    }),
  })

  const result = await resp.json()
  if (!resp.ok) {
    console.error('Resend error:', result)
    throw new Error(result.message || 'Email send failed')
  }

  return { id: result.id }
}