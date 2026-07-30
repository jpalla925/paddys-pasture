import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const BOARDER_FIELDS = [
  ['photo_url', 'Photo URL'],
  ['sex', 'Sex'],
  ['age', 'Age'],
  ['color', 'Color'],
  ['supplements', 'Supplements'],
  ['medications', 'Medications'],
  ['vet_info', 'Veterinarian info'],
  ['farrier_info', 'Farrier info'],
  ['emergency_contacts', 'Emergency contacts'],
  ['behavior_notes', 'Behavior & handling notes'],
  ['boarding_date', 'Boarding date'],
]

export default function BoarderHorseView({ userId }) {
  const [horses, setHorses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('horses').select('*').eq('owner_id', userId).order('name')
      .then(({ data }) => { setHorses(data ?? []); setLoading(false) })
  }, [userId])

  if (loading) return <p>Loading your horses...</p>
  if (horses.length === 0) {
    return <p style={{ color: '#777' }}>No horses assigned to you yet. The barn will set one up for you.</p>
  }

  return (
    <div>
      <h3 style={{ color: '#2F4A3D' }}>Your horses</h3>
      {horses.map((horse) => (
        <HorseCard key={horse.id} horse={horse} />
      ))}
    </div>
  )
}

function HorseCard({ horse }) {
  const [form, setForm] = useState(horse)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    const updates = {}
    for (const [field] of BOARDER_FIELDS) {
      updates[field] = form[field] === '' ? null : form[field]
    }
    const { error } = await supabase.from('horses').update(updates).eq('id', horse.id)
    setMessage(error ? 'Error: ' + error.message : 'Saved.')
    setSaving(false)
  }

  const label = { display: 'block', fontSize: 13, marginBottom: 2, color: '#2F4A3D' }
  const input = { display: 'block', width: '100%', marginBottom: 10, padding: 8 }

  return (
    <div style={{ border: '1px solid #d8d2c4', borderRadius: 8, padding: 20, marginBottom: 20, background: '#fbf9f5', maxWidth: 480 }}>
      <h4 style={{ color: '#8A5A34', marginTop: 0 }}>{horse.name}</h4>

      {/* Barn-set facts — shown read-only so the boarder sees them but can't edit */}
      <div style={{ fontSize: 13, color: '#555', marginBottom: 16, lineHeight: 1.6 }}>
        <div>Stall: {horse.stall_number || '—'}</div>
        <div>Hay: {horse.hay || '—'} &nbsp; Grain: {horse.grain || '—'}</div>
        <div>Pasture: {horse.pasture || '—'} &nbsp; Turnout: {horse.turnout || '—'}</div>
      </div>

      {BOARDER_FIELDS.map(([field, labelText]) => (
        <div key={field}>
          <label style={label}>{labelText}</label>
          {field === 'boarding_date' ? (
            <input type="date" value={form[field] || ''} onChange={(e) => update(field, e.target.value)} style={input} />
          ) : field === 'behavior_notes' ? (
            <textarea value={form[field] || ''} onChange={(e) => update(field, e.target.value)} rows={3} style={input} />
          ) : (
            <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} style={input} />
          )}
        </div>
      ))}

      <button onClick={save} disabled={saving}
        style={{ padding: '8px 16px', background: '#2F4A3D', color: 'white', border: 'none', borderRadius: 4 }}>
        {saving ? 'Saving...' : 'Save my details'}
      </button>
      {message && <p style={{ marginTop: 10 }}>{message}</p>}
    </div>
  )
}