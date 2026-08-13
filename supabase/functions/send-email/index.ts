import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only signed-in staff/admin may trigger emails
    const authHeader = req.headers.get('Authorization')!
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401, headers: corsHeaders })
    }
    const { data: profile } = await callerClient
      .from('profiles').select('role').eq('id', caller.id).single()
    if (!['admin', 'staff'].includes(profile?.role)) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403, headers: corsHeaders })
    }

    // What to send
    const { to, subject, html } = await req.json()
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing to, subject, or html' }), { status: 400, headers: corsHeaders })
    }

    // Send via the shared helper
    try {
      const { id } = await sendEmail({ to, subject, html })
      return new Response(JSON.stringify({ success: true, id }), { status: 200, headers: corsHeaders })
    } catch (mailErr) {
      console.error('send-email error:', mailErr)
      return new Response(JSON.stringify({ error: mailErr.message }), { status: 400, headers: corsHeaders })
    }
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})