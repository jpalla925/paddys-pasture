import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Link } from 'react-router-dom'
import DisplayField from './DisplayField'
import MedicalRecords from './MedicalRecords'

export default function HorseGrid({ refreshSignal, isAdmin }) {
  const [horses, setHorses] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  async function loadHorses() {
    setLoading(true)
    const { data } = await supabase.from('horses')
      .select('*, owner:profiles(full_name, email, phone)')
      .order('name')
    setHorses(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadHorses() }, [refreshSignal])

  if (loading) return <p>Loading horses...</p>

  // ----- DETAIL VIEW (a horse is selected) -----
  if (selectedId) {
    const horse = horses.find((h) => h.id === selectedId)
    if (!horse) { setSelectedId(null); return null }
    return (
      <HorseDetail
        horse={horse}
        isAdmin={isAdmin}
        onBack={() => setSelectedId(null)}
        onSaved={async () => { await loadHorses() }}
      />
    )
  }

  // ----- GALLERY -----
  const term = search.trim().toLowerCase()
  const visible = horses.filter((h) => {
    const owner = h.owner?.full_name || h.owner?.email || ''
    return h.name.toLowerCase().includes(term) || owner.toLowerCase().includes(term)
  })

  return (
    <div className="horse-gallery">
      <h3>All horses</h3>
      <input placeholder="Search by horse or owner..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search-input" />

      {visible.length === 0 ? (
        <p className="text-muted">No horses to show.</p>
      ) : (
        <div className="horse-grid">
          {visible.map((h) => {
            const owner = h.owner?.full_name || h.owner?.email || 'Unassigned'
            return (
              <div key={h.id} className="horse-tile" onClick={() => setSelectedId(h.id)} style={{ cursor: 'pointer' }}>
                <div className="horse-tile-photo">
                  {h.photo_url
                    ? <img src={h.photo_url} alt={h.name} />
                    : <span className="horse-tile-placeholder">🐴</span>}
                </div>
                <div className="horse-tile-info">
                  <strong className="horse-tile-name">{h.name}</strong>
                  <div className="horse-tile-owner">({owner})</div>
                  {h.stall_number && <div className="horse-tile-meta">Stall {h.stall_number}</div>}
                  <Link to={`/horse/${h.id}/print`} className="no-print horse-tile-link"
                    onClick={(e) => e.stopPropagation()}>
                    Print sheet →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Fields an admin can edit, grouped for the form
const ADMIN_FIELDS = [
  ['name', 'Horse name'],
  ['boarding_date', 'Boarding date'],
  ['stall_number', 'Stall number'],
  ['hay', 'Hay'],
  ['grain', 'Grain'],
  ['pasture', 'Pasture'],
  ['turnout', 'Turnout'],
]
const BOARDER_FIELDS = [
  ['photo_url', 'Photo URL'],
  ['breed', 'Breed'],
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
  ['intro_story', 'Short intro story'],
  ['photo_permission', 'Photo permission'],
]

function HorseDetail({ horse, isAdmin, onBack, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(horse)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const owner = horse.owner?.full_name || horse.owner?.email || 'Unassigned'

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage('')
    const updates = {}
    for (const [field] of [...ADMIN_FIELDS, ...BOARDER_FIELDS]) {
      updates[field] = form[field] === '' ? null : form[field]
    }
    const { error } = await supabase.from('horses').update(updates).eq('id', horse.id)
    if (error) {
      setMessage('Error: ' + error.message)
    } else {
      setEditing(false)
      await onSaved()   // refresh the gallery data
    }
    setSaving(false)
  }

  // ----- EDIT FORM (admin only) -----
  if (editing) {
    const renderField = ([field, labelText]) => (
      <div key={field}>
        {field === 'photo_permission' ? (
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }}
              checked={!!form[field]}
              onChange={(e) => update(field, e.target.checked)} />
            {labelText}
          </label>
        ) : (
          <>
            <label className="field-label">{labelText}</label>
            {field === 'boarding_date' || field === 'coggins_date' ? (
              <input type="date" value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
            ) : field === 'behavior_notes' || field === 'intro_story' ? (
              <textarea value={form[field] || ''} onChange={(e) => update(field, e.target.value)} rows={3} />
            ) : (
              <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
            )}
          </>
        )}
      </div>
    )
    return (
      <div className="card horse-detail">
        <h3 className="text-saddle">Edit {horse.name}</h3>
        <h4>Barn-managed</h4>
        {ADMIN_FIELDS.map(renderField)}
        <h4>Owner details</h4>
        {BOARDER_FIELDS.map(renderField)}
        <div className="horse-card-actions">
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <button className="btn btn-secondary" onClick={() => { setForm(horse); setEditing(false) }} disabled={saving}>
            Cancel
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </div>
    )
  }

  // ----- READ-ONLY DETAIL VIEW -----
  return (
    <div className="card horse-detail">
      <div className="horse-card-header">
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <div className="horse-detail-actions">
          <Link to={`/horse/${horse.id}/print`} className="btn btn-secondary no-print">Print</Link>
          {isAdmin && <button className="btn" onClick={() => { setForm(horse); setEditing(true) }}>Edit</button>}
        </div>
      </div>

      <h3 className="text-saddle">{horse.name} <span className="horse-detail-owner">({owner})</span></h3>

      <div className="print-top-row">
        <div className="print-photo">
          {horse.photo_url
            ? <img src={horse.photo_url} alt={horse.name} />
            : <span className="print-photo-placeholder">🐴</span>}
        </div>
        <div className="print-fields">
          <DisplayField label="Breed" value={horse.breed} />
          <DisplayField label="Sex" value={horse.sex} />
          <DisplayField label="Age" value={horse.age} />
          <DisplayField label="Color" value={horse.color} />
          <DisplayField label="Boarding date" value={horse.boarding_date} />
        </div>
      </div>

      <h4 className="print-section-heading">Barn-managed</h4>
      <div className="horse-card-facts">
        <div>Stall: {horse.stall_number || '—'}</div>
        <div>Hay: {horse.hay || '—'} &nbsp; Grain: {horse.grain || '—'}</div>
        <div>Pasture: {horse.pasture || '—'} &nbsp; Turnout: {horse.turnout || '—'}</div>
      </div>

      <h4 className="print-section-heading print-section-heading--spaced">Owner details</h4>
      <div className="print-grid">
        <DisplayField label="Supplements" value={horse.supplements} />
        <DisplayField label="Medications" value={horse.medications} />
        <DisplayField label="Veterinarian info" value={horse.vet_info} />
        <DisplayField label="Farrier info" value={horse.farrier_info} />
        <DisplayField label="Emergency contacts" value={horse.emergency_contacts} />
        <DisplayField label="Owner phone" value={horse.owner?.phone} />
        <DisplayField label="Photo permission" value={horse.photo_permission ? 'Yes' : 'No'} />
      </div>

      <div className="print-notes">
        <DisplayField label="Behavior & handling notes" value={horse.behavior_notes} />
        <DisplayField label="Short intro story" value={horse.intro_story} />
      </div>

      <MedicalRecords horse={horse} userId={horse.owner_id} canUpload={false} />

    </div>
  )
}