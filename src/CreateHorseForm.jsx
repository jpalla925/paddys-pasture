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

  const label = { display: 'block', fontSize: 13, marginBottom: 2, color: '#2F4A3D' }
  const input = { display: 'block', width: '100%', marginBottom: 10, padding: 8 }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 420, marginBottom: 32 }}>
      <h3 style={{ color: '#2F4A3D' }}>Add a horse</h3>

      <label style={label}>Owner (boarder)</label>
      <select value={form.owner_id} onChange={(e) => update('owner_id', e.target.value)} required style={input}>
        <option value="">Select a boarder...</option>
        {boarders.map((b) => <option key={b.id} value={b.id}>{b.full_name || b.email}</option>)}
      </select>

      <label style={label}>Horse name</label>
      <input value={form.name} onChange={(e) => update('name', e.target.value)} required style={input} />

      <label style={label}>Stall number</label>
      <input value={form.stall_number} onChange={(e) => update('stall_number', e.target.value)} style={input} />

      <label style={label}>Hay (type & amount)</label>
      <input value={form.hay} onChange={(e) => update('hay', e.target.value)} style={input} />

      <label style={label}>Grain (type & amount)</label>
      <input value={form.grain} onChange={(e) => update('grain', e.target.value)} style={input} />

      <label style={label}>Pasture</label>
      <input value={form.pasture} onChange={(e) => update('pasture', e.target.value)} style={input} />

      <label style={label}>Turnout</label>
      <input value={form.turnout} onChange={(e) => update('turnout', e.target.value)} style={input} />

      <button type="submit" disabled={saving}
        style={{ padding: '8px 16px', background: '#2F4A3D', color: 'white', border: 'none', borderRadius: 4 }}>
        {saving ? 'Saving...' : 'Create horse'}
      </button>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
    </form>
  )
}