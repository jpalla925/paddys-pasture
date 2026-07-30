import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import DisplayField from './DisplayField'

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
    return <p className="text-muted">No horses assigned to you yet. The barn will set one up for you.</p>
  }

  return (
    <div className="horse-gallery">
      <h3>Your horses</h3>
      {horses.map((horse) => (
        <HorseCard key={horse.id} horse={horse} />
      ))}
    </div>
  )
}

// Does this horse have the boarder's side filled in yet?
function isComplete(horse) {
  return BOARDER_FIELDS.some(([field]) => horse[field])
}

function HorseCard({ horse }) {
  // Start in view mode if they've already filled things in, edit mode if it's blank
  const [editing, setEditing] = useState(!isComplete(horse))
  const [current, setCurrent] = useState(horse)   // the saved version we display
  const [form, setForm] = useState(horse)         // the working copy being edited
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
    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setCurrent(form)     // lock in the saved values as what we display
      setEditing(false)    // switch to the read-only view
      setMessage('')
    }
    setSaving(false)
  }

  function startEdit() {
    setForm(current)       // edit from the currently-saved values
    setEditing(true)
    setMessage('')
  }

  // ---------- READ-ONLY DISPLAY ----------
  if (!editing) {
    return (
      <div className="card horse-card">
        <div className="horse-card-header">
          <h4 className="text-saddle">{current.name}</h4>
          <button className="btn btn-secondary" onClick={startEdit}>Edit</button>
        </div>

        <div className="print-top-row">
          <div className="print-photo">
            {current.photo_url
              ? <img src={current.photo_url} alt={current.name} />
              : <span className="print-photo-placeholder">🐴</span>}
          </div>
          <div className="print-fields">
            <DisplayField label="Sex" value={current.sex} />
            <DisplayField label="Age" value={current.age} />
            <DisplayField label="Color" value={current.color} />
            <DisplayField label="Boarding date" value={current.boarding_date} />
          </div>
        </div>

        <div className="horse-card-facts">
          <div>Stall: {current.stall_number || '—'}</div>
          <div>Hay: {current.hay || '—'} &nbsp; Grain: {current.grain || '—'}</div>
          <div>Pasture: {current.pasture || '—'} &nbsp; Turnout: {current.turnout || '—'}</div>
        </div>

        <div className="print-grid">
          <DisplayField label="Supplements" value={current.supplements} />
          <DisplayField label="Medications" value={current.medications} />
          <DisplayField label="Veterinarian info" value={current.vet_info} />
          <DisplayField label="Farrier info" value={current.farrier_info} />
          <DisplayField label="Emergency contacts" value={current.emergency_contacts} />
        </div>

        <div className="print-notes">
          <DisplayField label="Behavior & handling notes" value={current.behavior_notes} />
        </div>
      </div>
    )
  }

  // ---------- EDIT FORM ----------
  return (
    <div className="card horse-card">
      <h4 className="text-saddle">{current.name}</h4>

      {/* Barn-set facts — shown read-only so the boarder sees them but can't edit */}
      <div className="horse-card-facts">
        <div>Stall: {current.stall_number || '—'}</div>
        <div>Hay: {current.hay || '—'} &nbsp; Grain: {current.grain || '—'}</div>
        <div>Pasture: {current.pasture || '—'} &nbsp; Turnout: {current.turnout || '—'}</div>
      </div>

      {BOARDER_FIELDS.map(([field, labelText]) => (
        <div key={field}>
          <label className="field-label">{labelText}</label>
          {field === 'boarding_date' ? (
            <input type="date" value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
          ) : field === 'behavior_notes' ? (
            <textarea value={form[field] || ''} onChange={(e) => update(field, e.target.value)} rows={3} />
          ) : (
            <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
          )}
        </div>
      ))}

      <div className="horse-card-actions">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save my details'}
        </button>
        {isComplete(current) && (
          <button className="btn btn-secondary" onClick={() => { setEditing(false); setForm(current) }} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {message && <p className="form-message">{message}</p>}
    </div>
  )
}
