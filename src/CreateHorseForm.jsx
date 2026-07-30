import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function CreateHorseForm({ onCreated, refreshSignal }) {
  const [boarders, setBoarders] = useState([])
  const [form, setForm] = useState({
    owner_id: '', name: '', stall_number: '', hay: '', grain: '', pasture: '', turnout: '',
  })
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  // Load boarders for the owner dropdown
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, email').eq('role', 'boarder')
      .then(({ data }) => setBoarders(data ?? []))
  }, [refreshSignal])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('horses').insert({
      owner_id: form.owner_id, name: form.name, stall_number: form.stall_number,
      hay: form.hay, grain: form.grain, pasture: form.pasture, turnout: form.turnout,
    })
    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setMessage('Horse created — the boarder can now complete their side.')
      setForm({ owner_id: '', name: '', stall_number: '', hay: '', grain: '', pasture: '', turnout: '' })
      onCreated?.()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="form-narrow">
      <h3>Add a horse</h3>

      <label className="field-label">Owner (boarder)</label>
      <select value={form.owner_id} onChange={(e) => update('owner_id', e.target.value)} required>
        <option value="">Select a boarder...</option>
        {boarders.map((b) => <option key={b.id} value={b.id}>{b.full_name || b.email}</option>)}
      </select>

      <label className="field-label">Horse name</label>
      <input value={form.name} onChange={(e) => update('name', e.target.value)} required />

      <label className="field-label">Stall number</label>
      <input value={form.stall_number} onChange={(e) => update('stall_number', e.target.value)} />

      <label className="field-label">Hay (type & amount)</label>
      <input value={form.hay} onChange={(e) => update('hay', e.target.value)} />

      <label className="field-label">Grain (type & amount)</label>
      <input value={form.grain} onChange={(e) => update('grain', e.target.value)} />

      <label className="field-label">Pasture</label>
      <input value={form.pasture} onChange={(e) => update('pasture', e.target.value)} />

      <label className="field-label">Turnout</label>
      <input value={form.turnout} onChange={(e) => update('turnout', e.target.value)} />

      <button type="submit" className="btn" disabled={saving}>
        {saving ? 'Saving...' : 'Create horse'}
      </button>
      {message && <p className="form-message">{message}</p>}
    </form>
  )
}