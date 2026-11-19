import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'
import { appUrl } from '../_shared/config.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Browsers send a preflight "OPTIONS" request first — answer it.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Who is making this request? (their login token comes in the header)
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

    // 2. Is that caller an admin? (only admins may create accounts)
    const { data: callerProfile } = await callerClient
      .from('profiles').select('role').eq('id', caller.id).single()
    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can create accounts' }), { status: 403, headers: corsHeaders })
    }

    // 3. Read the new person's details from the request
    const { email, password, role } = await req.json()

    // 4. Create the account using the privileged (service role) key
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!
    )
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // skip the confirmation email; Theresa vouches for them
    })
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders })
    }

    // 5. Fill in their profile (name, phone, role, and flag the temp password)
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        role,
        must_change_password: true,
      })
      .eq('id', created.user.id)
    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), { status: 400, headers: corsHeaders })
    }
    
    const loginUrl = appUrl()
    // Boarders get the horse + Coggins heads-up; everyone gets install steps.
    const boarderNote = role === 'boarder'
      ? `<p>When you first log in, you'll set your own password, add an emergency contact,
         and answer a quick photo-sharing question. Then you'll add your horse's information.
         <strong>Have your horse's Coggins handy</strong> (a photo or PDF is fine), or you can
         choose to give it to the barn instead.</p>`
      : `<p>When you first log in, you'll set your own password and fill in your details.</p>`

    const emailHtml = `
      <div style="font-family: sans-serif; color: #22302a; max-width: 500px;">
        <h2 style="color: #2F4A3D;">Welcome to Paddy's Gate</h2>
        <p>An account has been created for you on Paddy's Gate, the Paddy's Pastures
        barn app. Here's how to get started:</p>
        <p>
          <strong>Login page:</strong> <a href="${loginUrl}" style="color: #2F4A3D;">${loginUrl}</a><br/>
          <strong>Your email:</strong> ${email}<br/>
          <strong>Temporary password:</strong> ${password}
        </p>
        ${boarderNote}

        <h3 style="color: #2F4A3D; margin-bottom: 4px;">Put Paddy's Gate on your home screen</h3>
        <p style="margin-top: 0;">It opens like an app, with no app store needed.</p>

        <p style="margin-bottom: 4px;"><strong>iPhone</strong></p>
        <ol style="margin-top: 0;">
          <li>Open the login link above <strong>in Safari</strong> (other browsers won't show the option).</li>
          <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up).</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</li>
        </ol>

        <p style="margin-bottom: 4px;"><strong>Android</strong></p>
        <ol style="margin-top: 0;">
          <li>Open the login link above in <strong>Chrome</strong>.</li>
          <li>Tap the <strong>menu</strong> (three dots, top right).</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</li>
        </ol>

        <p>See you at the barn!</p>
      </div>
    `

    try {
      await sendEmail({
        to: email,
        subject: 'Welcome to Paddy\'s Gate — your login details',
        html: emailHtml,
      })
    } catch (mailErr) {
      // Account is already created; a failed welcome email shouldn't fail the request.
      console.error('Welcome email failed:', mailErr)
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})