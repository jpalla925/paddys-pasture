import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import DisplayField from './DisplayField'
import PhotoUpload from './PhotoUpload'
import MedicalRecords from './MedicalRecords'

// Simple fields: [key, label, required]
const SIMPLE_FIELDS = [
  ['breed', 'Breed', true],
  ['sex', 'Sex', true],
  ['age', 'Age', true],
  ['color', 'Color', true],
  ['supplements', 'Supplements', true],
  ['medications', 'Medications', true],
]

// Structured fields: stored combined into one column, but entered as sub-parts.
// [key, label, [subfields], required]
const STRUCTURED_FIELDS = [
  ['vet_info', 'Veterinarian', ['name', 'address', 'phone'], true],
  ['farrier_info', 'Farrier', ['name', 'address', 'phone'], true],
  ['emergency_contacts', 'Emergency contact', ['name', 'relationship', 'phone'], true],
]

const TAIL_FIELDS = [
  ['behavior_notes', 'Behavior & handling notes', true],
]

// --- helpers for combining/splitting structured fields ---
const SEP = ' · '
function combine(parts, keys) {
  return keys.map((k) => (parts[k] || '').trim()).join(SEP)
}
function splitStored(value, keys) {
  const bits = String(value ?? '').split(SEP)
  const out = {}
  keys.forEach((k, i) => { out[k] = bits[i] || '' })
  return out
}

// Build the flat DB row from a form's working state
function buildUpdates(form, structuredState) {
  const updates = {}
  for (const [field] of SIMPLE_FIELDS) updates[field] = String(form[field] ?? '').trim() || null
  for (const [field] of TAIL_FIELDS) updates[field] = String(form[field] ?? '').trim() || null
  for (const [field, , keys] of STRUCTURED_FIELDS) {
    const combined = combine(structuredState[field] || {}, keys)
    updates[field] = combined.replace(/(\s·\s)+$/,'').trim() || null   // drop trailing empty separators
  }
  return updates
}

// Which required fields are still missing?
function missingRequired(form, structuredState) {
  const missing = []
  for (const [field, label, required] of [...SIMPLE_FIELDS, ...TAIL_FIELDS]) {
    if (required && !String(form[field] ?? '').trim()) missing.push(label)
  }
  for (const [field, label, keys, required] of STRUCTURED_FIELDS) {
    if (required) {
      const anyFilled = keys.some((k) => (structuredState[field]?.[k] || '').trim())
      if (!anyFilled) missing.push(label)
    }
  }
  return missing
}

export default function BoarderHorseView({ userId }) {
  const [horses, setHorses] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState(null)   // which completed horse's detail is open

  async function loadHorses() {
    const { data } = await supabase.from('horses').select('*').eq('owner_id', userId).order('name')
    setHorses(data ?? [])
    setLoading(false)
  }
  useEffect(() => { loadHorses() }, [userId])

  if (loading) return <p>Loading your horses...</p>

  // If a completed horse is selected, show its detail view
  if (selectedId) {
    const horse = horses.find((h) => h.id === selectedId)
    if (!horse) { setSelectedId(null); return null }
    return <HorseDetail horse={horse} onBack={() => setSelectedId(null)} />
  }

  const incomplete = horses.filter((h) => !h.boarder_completed)
  const completed = horses.filter((h) => h.boarder_completed)

  return (
    <div className="horse-gallery">
      <div className="horse-card-header">
        <h3>Your horses</h3>
        {!adding && <button className="btn" onClick={() => setAdding(true)}>+ Add a horse</button>}
      </div>

      {horses.length === 0 && !adding && (
        <p className="text-muted">You haven't added a horse yet. Click "Add a horse" to get started.</p>
      )}

      {adding && (
        <HorseForm
          mode="new"
          userId={userId}
          onCancel={() => setAdding(false)}
          onDone={async () => { setAdding(false); await loadHorses() }}
        />
      )}

      {/* Incomplete horses stay as full editable cards */}
      {incomplete.map((horse) => (
        <HorseCard key={horse.id} horse={horse} onChanged={loadHorses} />
      ))}

      {/* Completed horses show as a gallery-style tile grid */}
      {completed.length > 0 && (
        <div className="horse-grid">
          {completed.map((horse) => (
            <div key={horse.id} className="horse-tile" onClick={() => setSelectedId(horse.id)} style={{ cursor: 'pointer' }}>
              <div className="horse-tile-photo">
                {horse.photo_url
                  ? <img src={horse.photo_url} alt={horse.name} />
                  : <span className="horse-tile-placeholder">🐴</span>}
              </div>
              <div className="horse-tile-info">
                <strong className="horse-tile-name">{horse.name}</strong>
                <div className="horse-tile-meta"><span className="badge-complete">✓ Complete</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Reusable form (used for new horse AND editing) ----------
function HorseForm({ mode, userId, horse, onCancel, onDone }) {
  const [name, setName] = useState(horse?.name || '')
  const [form, setForm] = useState(horse || {})
  const [structured, setStructured] = useState(() => {
    const init = {}
    for (const [field, , keys] of STRUCTURED_FIELDS) init[field] = splitStored(horse?.[field], keys)
    return init
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const updateSub = (field, key, value) =>
    setStructured((s) => ({ ...s, [field]: { ...s[field], [key]: value } }))

  async function persist(markComplete) {
    if (!name.trim()) { setMessage("Please enter your horse's name."); return }

    if (markComplete) {
      const missing = missingRequired(form, structured)
      if (missing.length > 0) {
        setMessage('Please complete these before submitting: ' + missing.join(', '))
        return
      }
      const ok = window.confirm(
        `Once you submit ${name.trim()}, the profile is complete and sent to the barn. ` +
        `To make changes afterward, just reach out to the barn staff.\n\nSubmit ${name.trim()}?`
      )
      if (!ok) return
    }

    setSaving(true)
    setMessage('')
    const payload = {
      name: name.trim(),
      ...buildUpdates(form, structured),
      photo_url: form.photo_url || null,
      intro_story: String(form.intro_story ?? '').trim() || null,
      photo_permission: !!form.photo_permission,
    }
    if (markComplete) payload.boarder_completed = true

    let error
    if (mode === 'new') {
      ({ error } = await supabase.from('horses').insert({ owner_id: userId, ...payload }))
    } else {
      ({ error } = await supabase.from('horses').update(payload).eq('id', horse.id))
    }
    if (error) { setMessage('Error: ' + error.message); setSaving(false); return }
    await onDone()
  }

  return (
    <div className="card horse-card">
      <h4 className="text-saddle">{mode === 'new' ? 'Add a horse' : `Edit ${horse.name}`}</h4>

      <label className="field-label">Horse name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} required />

      <label className="field-label">Photo <span className="text-muted">(optional)</span></label>
      <PhotoUpload
        currentUrl={form.photo_url}
        onUploaded={(url) => update('photo_url', url)}
      />

      {SIMPLE_FIELDS.map(([field, labelText, required]) => (
        <div key={field}>
          <label className="field-label">
            {labelText}{!required && <span className="text-muted"> Picture of owner with horse recommended.</span>}
          </label>
          <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
        </div>
      ))}

      {STRUCTURED_FIELDS.map(([field, labelText, keys]) => (
        <div key={field} className="structured-field">
          <label className="field-label">{labelText}</label>
          <div className="structured-subfields">
            {keys.map((k) => (
              <input key={k}
                placeholder={k.charAt(0).toUpperCase() + k.slice(1)}
                value={structured[field]?.[k] || ''}
                onChange={(e) => updateSub(field, k, e.target.value)} />
            ))}
          </div>
        </div>
      ))}

      <label className="field-label">Behavior & handling notes</label>
      <textarea value={form.behavior_notes || ''} onChange={(e) => update('behavior_notes', e.target.value)} rows={3} />

      <label className="field-label">Short intro story <span className="text-muted">(for the barn's social media)</span></label>
      <textarea value={form.intro_story || ''} onChange={(e) => update('intro_story', e.target.value)} rows={3}
        placeholder="A few sentences introducing you and your horse..." />

      <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" style={{ width: 'auto' }}
          checked={!!form.photo_permission}
          onChange={(e) => update('photo_permission', e.target.checked)} />
        I give permission to use photos of my horse on Paddy's Pastures' social media
      </label>

      <div className="horse-card-actions">
        <button className="btn btn-secondary" onClick={() => persist(false)} disabled={saving}>
          {saving ? 'Saving...' : 'Save for later'}
        </button>
        <button className="btn" onClick={() => persist(true)} disabled={saving}>
          Finish &amp; submit
        </button>
        {onCancel && <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>}
      </div>
      <p className="text-muted" style={{ marginTop: 8, fontSize: 13 }}>
        "Save for later" keeps it editable. "Finish &amp; submit" completes the profile and sends it to the barn.
      </p>
      {message && <p className="form-message">{message}</p>}
    </div>
  )
}

// ---------- Existing horse: display, with edit until complete ----------
function HorseCard({ horse, onChanged }) {
  const complete = horse.boarder_completed
  const [editing, setEditing] = useState(false)

  if (editing && !complete) {
    return <HorseForm mode="edit" horse={horse}
      onCancel={() => setEditing(false)}
      onDone={async () => { setEditing(false); await onChanged() }} />
  }
  // helper to show a structured field nicely
  const showStructured = (value) => (value ? value.split(SEP).filter(Boolean).join(' · ') : '—')

  return (
    <div className="card horse-card">
      <div className="horse-card-header">
        <h4 className="text-saddle">
          {horse.name} {complete && <span className="badge-complete">✓ Complete</span>}
        </h4>
        {!complete && <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit / Finish</button>}
      </div>

      <div className="print-top-row">
        <div className="print-photo">
          {horse.photo_url ? <img src={horse.photo_url} alt={horse.name} /> : <span className="print-photo-placeholder">🐴</span>}
        </div>
        <div className="print-fields">
          <DisplayField label="Breed" value={horse.breed} />
          <DisplayField label="Sex" value={horse.sex} />
          <DisplayField label="Age" value={horse.age} />
          <DisplayField label="Color" value={horse.color} />
          <DisplayField label="Boarding date" value={horse.boarding_date} />
        </div>
      </div>

      <div className="horse-card-facts">
        <div>Stall: {horse.stall_number || '—'}</div>
        <div>Hay: {horse.hay || '—'} &nbsp; Grain: {horse.grain || '—'}</div>
        <div>Pasture: {horse.pasture || '—'} &nbsp; Turnout: {horse.turnout || '—'}</div>
      </div>

      <div className="print-grid">
        <DisplayField label="Supplements" value={horse.supplements} />
        <DisplayField label="Medications" value={horse.medications} />
        <DisplayField label="Veterinarian" value={showStructured(horse.vet_info)} />
        <DisplayField label="Farrier" value={showStructured(horse.farrier_info)} />
        <DisplayField label="Emergency contact" value={showStructured(horse.emergency_contacts)} />
        <DisplayField label="Coggins date" value={horse.coggins_date} />
        <DisplayField label="Photo permission" value={horse.photo_permission ? 'Yes' : 'No'} />
      </div>
      <div className="print-notes">
        <DisplayField label="Behavior & handling notes" value={horse.behavior_notes} />
        <DisplayField label="Short intro story" value={horse.intro_story} />
      </div>

       <MedicalRecords horse={horse} userId={horse.owner_id} canUpload={true} />

      {!complete && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Not finished yet — click "Edit / Finish" to complete and submit.
        </p>
      )}
    </div>
  )
}

// ---------- Read-only detail for a completed horse (opened from the tile grid) ----------
function HorseDetail({ horse, onBack }) {
  const showStructured = (value) => (value ? value.split(SEP).filter(Boolean).join(' · ') : '—')

  return (
    <div className="card horse-card">
      <div className="horse-card-header">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <h4 className="text-saddle">
          {horse.name} <span className="badge-complete">✓ Complete</span>
        </h4>
      </div>

      <div className="print-top-row">
        <div className="print-photo">
          {horse.photo_url ? <img src={horse.photo_url} alt={horse.name} /> : <span className="print-photo-placeholder">🐴</span>}
        </div>
        <div className="print-fields">
          <DisplayField label="Breed" value={horse.breed} />
          <DisplayField label="Sex" value={horse.sex} />
          <DisplayField label="Age" value={horse.age} />
          <DisplayField label="Color" value={horse.color} />
          <DisplayField label="Boarding date" value={horse.boarding_date} />
        </div>
      </div>

      <div className="horse-card-facts">
        <div>Stall: {horse.stall_number || '—'}</div>
        <div>Hay: {horse.hay || '—'} &nbsp; Grain: {horse.grain || '—'}</div>
        <div>Pasture: {horse.pasture || '—'} &nbsp; Turnout: {horse.turnout || '—'}</div>
      </div>

      <div className="print-grid">
        <DisplayField label="Supplements" value={horse.supplements} />
        <DisplayField label="Medications" value={horse.medications} />
        <DisplayField label="Veterinarian" value={showStructured(horse.vet_info)} />
        <DisplayField label="Farrier" value={showStructured(horse.farrier_info)} />
        <DisplayField label="Emergency contact" value={showStructured(horse.emergency_contacts)} />
        <DisplayField label="Photo permission" value={horse.photo_permission ? 'Yes' : 'No'} />
      </div>
      <div className="print-notes">
        <DisplayField label="Behavior & handling notes" value={horse.behavior_notes} />
        <DisplayField label="Short intro story" value={horse.intro_story} />
      </div>

      <MedicalRecords horse={horse} userId={horse.owner_id} canUpload={true} />
    </div>
  )
}