import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function AddPersonForm({ onAdded }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', role: 'boarder', password: '',
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
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setMessage('Please enter a valid 10-digit phone number.')
      setSaving(false)
      return
    }
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
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: digits,
        role: form.role,
      },
    })

    console.log('Function response:', { data, error })

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
      setMessage(`${form.firstName} added as ${form.role}. Give them the temp password to change on first login.`)
      setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'boarder', password: '' })
      onAdded?.()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="card form-narrow">
      <h3>Add a person</h3>

      <label className="field-label">First name</label>
      <input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />

      <label className="field-label">Last name</label>
      <input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required />

      <label className="field-label">Email</label>
      <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />

      <label className="field-label">Phone (10 digits)</label>
      <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} required />

      <label className="field-label">Role</label>
      <select value={form.role} onChange={(e) => update('role', e.target.value)}>
        <option value="boarder">Boarder</option>
        <option value="staff">Staff</option>
      </select>

      <label className="field-label">Temporary password</label>
      <input value={form.password} onChange={(e) => update('password', e.target.value)} required />

      <button type="submit" className="btn" disabled={saving}>
        {saving ? 'Adding...' : 'Add person'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </form>
  )
}