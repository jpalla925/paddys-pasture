import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function ChangePassword({ userId, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.')
      return
    }

    setSaving(true)

    // 1. Update the actual login password
    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setMessage('Error: ' + pwError.message)
      setSaving(false)
      return
    }

    // 2. Clear the flag so they don't get sent here again
    const { error: flagError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', userId)
    if (flagError) {
      setMessage('Password changed, but flag update failed: ' + flagError.message)
      setSaving(false)
      return
    }

    onDone()   // tell the app to proceed
  }

  return (
    <div className="auth-page">
      <h2>Set your password</h2>
      <p className="text-muted">
        You're using a temporary password. Please choose your own to continue.
      </p>
      <form onSubmit={handleSubmit}>
        <input type="password" placeholder="New password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        <input type="password" placeholder="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit" className="btn btn-block" disabled={saving}>
          {saving ? 'Saving...' : 'Set password'}
        </button>
      </form>
      {message && <p className="form-error">{message}</p>}
    </div>
  )
}