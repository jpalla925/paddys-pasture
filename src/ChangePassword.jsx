import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function ChangePassword({ userId, role, onDone }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [heardAbout, setHeardAbout] = useState('')
  const [paymentPref, setPaymentPref] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')

    // Validation
    if (!firstName.trim() || !lastName.trim()) {
      setMessage('Please enter your first and last name.')
      return
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setMessage('Please enter a valid 10-digit phone number.')
      return
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }

    if (password !== confirm) {
      setMessage('Passwords do not match.')
      return
    }

    setSaving(true)

    // 0. Save profile details (name, phone, address if provided)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        phone: digits,
        address: address.trim() || null,
        heard_about: heardAbout || null,
        payment_preference: paymentPref || null,
        must_change_password: false
      })
    .eq('id', userId)
    if (profileError) {
      setMessage('Error saving profile: ' + profileError.message)
      setSaving(false)
      return
    }

    // 1. Update the actual login password
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setMessage('Error: ' + pwError.message)
      setSaving(false)
      return
    }

    onDone()
  }

  return (
    <div className="auth-page">
      <h2>Welcome - let's set up your account</h2>
      <p className="text-muted">
        Please fill in your details and choose a new password to continue.
      </p>
      <form onSubmit={handleSubmit}>
        <input type="text" placeholder="First name" value={firstName}
          onChange={(e) => setFirstName(e.target.value)} required />
        <input type="text" placeholder="Last name" value={lastName}
          onChange={(e) => setLastName(e.target.value)} required />
        <input type="tel" placeholder="Phone number" value={phone}
          onChange={(e) => setPhone(e.target.value)} required />
        <input type="text" placeholder="Mailing Address" value={address}
          onChange={(e) => setAddress(e.target.value)} />

        {role === 'boarder' && (
          <>
            <label className="field-label">How did you hear about Paddy's Pastures?</label>
            <select value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)}>
              <option value="">Select...</option>
              <option value="Facebook">Facebook</option>
              <option value="Instagram">Instagram</option>
              <option value="Google search">Google search</option>
              <option value="Word of mouth">Word of mouth</option>
              <option value="Other">Other</option>
            </select>

            <label className="field-label">Preferred payment method</label>
            <select value={paymentPref} onChange={(e) => setPaymentPref(e.target.value)}>
              <option value="">Select...</option>
              <option value="Check">Zelle</option>
              <option value="Venmo">Check</option>
              <option value="Cash">Cash</option>
            </select>
          </>
        )}
        
        <input type="password" placeholder="New password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        <input type="password" placeholder="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit" className="btn btn-block" disabled={saving}>
          {saving ? 'Saving...' : 'Complete Setup'}
        </button>
      </form>
      {message && <p className="form-error">{message}</p>}
    </div>
  )
}