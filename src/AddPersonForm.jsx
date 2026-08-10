import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function AddPersonForm({ onAdded }) {
  const [form, setForm] = useState({
    email: '', role: 'boarder', password: ''
  })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    // Basic checks
    if (form.password.length < 6) {
      setMessage('Temp password must be at least 6 characters.')
      setSaving(false)
      return
    }

    // Call the Edge Function (it verifies we're an admin, then creates the account)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      },
    })

    if (error || data?.error) {
        let detail = error.message
      try {
        const body = await error.context.json()
        detail = body.error || detail
        console.log('Real error:', body)
      } catch (_) { /* ignore */ }
      setMessage('Error: ' + detail)
      setSaving(false)
      return
    } else {
      setMessage(`${form.email} added as ${form.role}. Email has been sent with documentation and temp password.`)
      setForm({ email: '', role: 'boarder', password: '' })
      onAdded?.()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="card form-narrow">
      <h3>Add boarder</h3>

      <label className="field-label">Email</label>
      <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />

      <label className="field-label">Role</label>
      <select value={form.role} onChange={(e) => update('role', e.target.value)}>
        <option value="boarder">Boarder</option>
        <option value="staff">Staff</option>
      </select>

      <label className="field-label">Temporary password</label>
      <input value={form.password} onChange={(e) => update('password', e.target.value)} required />

      <button type="submit" className="btn" disabled={saving}>
        {saving ? 'Adding...' : 'Add boarder'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </form>
  )
}