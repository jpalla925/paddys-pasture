import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import DisplayField from './DisplayField'
import PhotoUpload from './PhotoUpload'
import MedicalRecords, { STATUS_LABEL } from './MedicalRecords'

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
// (Emergency contact moved to the boarder's profile -- one per person, not per horse.)
const STRUCTURED_FIELDS = [
  ['vet_info', 'Veterinarian', ['name', 'phone'], true],
  ['farrier_info', 'Farrier', ['name', 'phone'], true],
]

const TAIL_FIELDS = [
  ['behavior_notes', 'Behavior & handling notes', true],
]

// Every horse query asks for the derived Coggins status too (migration 161037).
const HORSE_SELECT = '*, coggins_status, coggins_expires_on'

const COGGINS_MISSING_LABEL = 'Coggins (upload it, or choose to give it to the barn)'

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
const showStructured = (value) => (value ? value.split(SEP).filter(Boolean).join(' · ') : '—')

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

// Which required fields are still missing? This is a courtesy check so the
// boarder sees problems before saving. The real rule is the database trigger
// enforce_horse_submission (migration 161036), which also checks the owner's
// profile; if it refuses, its message is shown as-is.
function missingRequired(form, structuredState, cogginsChoice, cogginsStatus) {
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
  if (cogginsChoice === 'upload' && (!cogginsStatus || cogginsStatus === 'missing')) {
    missing.push(COGGINS_MISSING_LABEL)
  }
  return missing
}

function CogginsBadge({ status }) {
  if (!status) return null
  return <span className={`coggins-badge coggins-badge--${status}`}>{STATUS_LABEL[status]}</span>
}

export default function BoarderHorseView({ userId }) {
  const [horses, setHorses] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState(null)   // which completed horse's detail is open

  async function loadHorses() {
    const { data } = await supabase.from('horses').select(HORSE_SELECT).eq('owner_id', userId).order('name')
    setHorses(data ?? [])
    setLoading(false)
    return data ?? []
  }
  // Onboarding nudge: a boarder with no horses yet lands straight in the form.
  useEffect(() => {
    loadHorses().then((list) => { if (list.length === 0) setAdding(true) })
  }, [userId])

  if (loading) return <p>Loading your horses...</p>

  // If a completed horse is selected, show its detail view
  if (selectedId) {
    const horse = horses.find((h) => h.id === selectedId)
    if (!horse) { setSelectedId(null); return null }
    return <HorseDetail horse={horse} onBack={() => setSelectedId(null)} onChanged={loadHorses} />
  }

  const incomplete = horses.filter((h) => !h.boarder_completed)
  const completed = horses.filter((h) => h.boarder_completed)

  // Closing the "new horse" form always reloads: it may have saved a draft
  // (to upload a Coggins) before the boarder cancelled.
  const closeNewForm = async () => { setAdding(false); await loadHorses() }

  return (
    <div className="horse-gallery">
      {/* Stays up until every horse is submitted (onboarding decision 5B:
          nudge, don't block -- messages still work). */}
      {horses.length === 0 && (
        <div className="onboarding-banner">
          <strong>Welcome! Next step: add your horse.</strong> Boarding more than one? Add each one.
        </div>
      )}
      {incomplete.length > 0 && (
        <div className="onboarding-banner">
          <strong>Almost done:</strong>{' '}
          {incomplete.map((h) => h.name).join(', ')} still {incomplete.length === 1 ? 'needs' : 'need'} to
          be finished and submitted to the barn.
        </div>
      )}

      <div className="horse-card-header">
        <h3>Your horses</h3>
        {!adding && <button className="btn" onClick={() => setAdding(true)}>+ Add a horse</button>}
      </div>

      {horses.length === 0 && !adding && (
        <p className="text-muted">You haven't added a horse yet. Click "Add a horse" to get started.</p>
      )}

      {adding && <HorseForm userId={userId} onCancel={closeNewForm} onDone={closeNewForm} />}

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
                <div className="horse-tile-meta">
                  <span className="badge-complete">✓ Complete</span>
                  {horse.coggins_status !== 'current' && <CogginsBadge status={horse.coggins_status} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Form for a new horse AND for finishing a draft ----------
// A Coggins record needs the horse's id, so a brand-new horse is saved as a
// draft before its Coggins can be uploaded ("Save and upload Coggins"). After
// that first save the form keeps going as an edit of that draft.
function HorseForm({ userId, horse: initialHorse, onCancel, onDone }) {
  const [horse, setHorse] = useState(initialHorse || null)   // null until first saved
  const isNew = !horse
  const [name, setName] = useState(initialHorse?.name || '')
  const [form, setForm] = useState(initialHorse || {})
  const [structured, setStructured] = useState(() => {
    const init = {}
    for (const [field, , keys] of STRUCTURED_FIELDS) init[field] = splitStored(initialHorse?.[field], keys)
    return init
  })
  const [cogginsChoice, setCogginsChoice] = useState(initialHorse?.coggins_to_barn ? 'to_barn' : 'upload')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const updateSub = (field, key, value) =>
    setStructured((s) => ({ ...s, [field]: { ...s[field], [key]: value } }))

  // After a Coggins upload/delete, re-read just the derived status from the database.
  async function refreshCoggins() {
    const { data } = await supabase.from('horses')
      .select('id, coggins_status, coggins_expires_on').eq('id', horse.id).single()
    if (data) setHorse((h) => ({ ...h, ...data }))
  }

  // mode: 'draft'  save and close
  //       'stay'   save and keep the form open (new horse -> Coggins upload)
  //       'submit' save and mark complete
  async function persist(mode) {
    if (!name.trim()) { setMessage("Please enter your horse's name."); return }

    if (mode === 'submit') {
      const missing = missingRequired(form, structured, cogginsChoice, horse?.coggins_status)
      if (missing.length > 0) {
        setMessage('Please complete these before submitting: ' + missing.join(', '))
        return
      }
      const ok = window.confirm(
        `Once you submit ${name.trim()}, the profile is complete and sent to the barn. ` +
        `To make changes afterward, just reach out to the barn staff. ` +
        `(You can still upload a newer Coggins at any time.)\n\nSubmit ${name.trim()}?`
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
      coggins_to_barn: cogginsChoice === 'to_barn',
    }
    if (mode === 'submit') payload.boarder_completed = true

    const query = isNew
      ? supabase.from('horses').insert({ owner_id: userId, ...payload })
      : supabase.from('horses').update(payload).eq('id', horse.id)
    const { data, error } = await query.select(HORSE_SELECT).single()

    // The database's own message is written for people (e.g. "This horse can't
    // be submitted yet. Missing: ..."), so it's shown as-is.
    if (error) { setMessage(error.message); setSaving(false); return }

    if (mode === 'stay') {
      setHorse(data)
      setSaving(false)
      setMessage('Saved as a draft. Now add the Coggins below.')
      return
    }
    await onDone()
  }

  return (
    <div className="card horse-card">
      <h4 className="text-saddle">{isNew ? 'Add a horse' : `Finish ${horse.name}`}</h4>

      <label className="field-label">Horse name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} required />

      <label className="field-label">
        Photo <span className="text-muted">(optional — a picture of you with your horse is recommended)</span>
      </label>
      <PhotoUpload
        currentUrl={form.photo_url}
        onUploaded={(url) => update('photo_url', url)}
      />

      {SIMPLE_FIELDS.map(([field, labelText]) => (
        <div key={field}>
          <label className="field-label">{labelText}</label>
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

      {/* ----- Coggins: required to submit, unless the boarder is bringing it ----- */}
      <div className="coggins-step">
        <label className="field-label">Coggins <span className="text-muted">(required)</span></label>
        <label className="consent-row">
          <input type="radio" name={`coggins-${horse?.id || 'new'}`}
            checked={cogginsChoice === 'upload'} onChange={() => setCogginsChoice('upload')} />
          <span>I'll upload my horse's Coggins</span>
        </label>
        <label className="consent-row">
          <input type="radio" name={`coggins-${horse?.id || 'new'}`}
            checked={cogginsChoice === 'to_barn'} onChange={() => setCogginsChoice('to_barn')} />
          <span>I'll give my Coggins to the barn</span>
        </label>

        {cogginsChoice === 'upload' && (isNew ? (
          <>
            <button className="btn btn-secondary" onClick={() => persist('stay')} disabled={saving}>
              {saving ? 'Saving...' : 'Save and upload Coggins'}
            </button>
            <p className="text-muted" style={{ fontSize: 13 }}>
              We'll save what you've entered so far as a draft, then you can add the Coggins file.
            </p>
          </>
        ) : (
          <MedicalRecords horse={horse} role="boarder" cogginsOnly onChanged={refreshCoggins} />
        ))}

        {cogginsChoice === 'to_barn' && (
          <p className="text-muted" style={{ fontSize: 13 }}>
            Please bring or send your Coggins to the barn. Your horse will show
            "Coggins pending" until the barn adds it.
          </p>
        )}
      </div>

      <div className="horse-card-actions">
        <button className="btn btn-secondary" onClick={() => persist('draft')} disabled={saving}>
          {saving ? 'Saving...' : 'Save for later'}
        </button>
        <button className="btn" onClick={() => persist('submit')} disabled={saving}>
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

// ---------- The read-only facts, shared by the draft card and the detail view ----------
function HorseSummary({ horse, onChanged }) {
  return (
    <>
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
      </div>
      <div className="print-notes">
        <DisplayField label="Behavior & handling notes" value={horse.behavior_notes} />
        <DisplayField label="Short intro story" value={horse.intro_story} />
      </div>

      <MedicalRecords horse={horse} role="boarder" onChanged={onChanged} />
    </>
  )
}

// ---------- Draft horse: display, with edit until complete ----------
function HorseCard({ horse, onChanged }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return <HorseForm horse={horse}
      onCancel={async () => { setEditing(false); await onChanged() }}
      onDone={async () => { setEditing(false); await onChanged() }} />
  }

  return (
    <div className="card horse-card">
      <div className="horse-card-header">
        <h4 className="text-saddle">{horse.name}</h4>
        <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit / Finish</button>
      </div>

      <HorseSummary horse={horse} onChanged={onChanged} />

      <p className="text-muted" style={{ fontSize: 13 }}>
        Not finished yet — click "Edit / Finish" to complete and submit.
      </p>
    </div>
  )
}

// ---------- Read-only detail for a completed horse (opened from the tile grid) ----------
function HorseDetail({ horse, onBack, onChanged }) {
  return (
    <div className="card horse-card">
      <div className="horse-card-header">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <h4 className="text-saddle">
          {horse.name} <span className="badge-complete">✓ Complete</span>
        </h4>
      </div>

      <HorseSummary horse={horse} onChanged={onChanged} />
    </div>
  )
}