import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const [mode, setMode] = useState('signin')   // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (mode === 'signup') {
      // 1. Create the login (trigger auto-creates a bare profile row)
      const { data, error } = await supabase.auth.signUp({ email, password })
      // Passwords must match
      if (password !== confirmPassword) {
        setMessage('Passwords do not match.')
        setLoading(false)
        return
      }
      // Phone must be a real 10-digit US number
      const digits = phone.replace(/\D/g, '')
      if (digits.length !== 10) {
        setMessage('Please enter a valid 10-digit phone number.')
        setLoading(false)
        return
      }
      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }

      // 2. Fill in the rest of their profile
      const userId = data.user?.id
      if (userId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: `${firstName.trim()} ${lastName.trim()}`,
            phone: digits,
          })
          .eq('id', userId)

        if (profileError) {
          setMessage('Account created, but saving your details failed: ' + profileError.message)
          setLoading(false)
          return
        }
      }

      setMessage('Account created — you can sign in now.')
      setMode('signin')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    }
    setLoading(false)
  }

  const input = { display: 'block', width: '100%', marginBottom: 8, padding: 8 }

  return (
    <div style={{ maxWidth: 340, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#2F4A3D' }}>Paddy's Pasture</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <>
            <input placeholder="First name" value={firstName}
              onChange={(e) => setFirstName(e.target.value)} required style={input} />
            <input placeholder="Last name" value={lastName}
              onChange={(e) => setLastName(e.target.value)} required style={input} />
            <input type="tel" placeholder="Phone (10 digits)" value={phone}
              onChange={(e) => setPhone(e.target.value)} required style={input} />
          </>
        )}

        <input type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} required style={input} />
        <input type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} required style={input} />
        {mode === 'signup' && (
          <input type="password" placeholder="Confirm password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} required style={input} />
        )}

        <button type="submit" disabled={loading} style={{ width: '100%', padding: 8, background: '#2F4A3D', color: 'white', border: 'none', borderRadius: 4 }}>
          {loading ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
        <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage('') }}
          style={{ background: 'none', border: 'none', color: '#2F4A3D', cursor: 'pointer', textDecoration: 'underline' }}>
          {mode === 'signup' ? 'Sign in' : 'Sign up'}
        </button>
      </p>

      {message && <p style={{ marginTop: 12, color: '#b00' }}>{message}</p>}
    </div>
  )
}