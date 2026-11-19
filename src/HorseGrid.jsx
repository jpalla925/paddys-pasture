import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Link } from 'react-router-dom'
import DisplayField from './DisplayField'
import MedicalRecords, { STATUS_LABEL } from './MedicalRecords'
import {
  HORSE_WITH_OWNER_SELECT, ownerName, formatPhone,
  emergencyContactText, photoConsentText, cogginsText,
} from './ownerDetails'

// Gallery filters. "Coggins pending" means SUBMITTED horses with no Coggins on
// file -- drafts haven't been handed to the barn yet. Status is derived in the
// database (coggins_status, migration 161037).
const FILTERS = {
  all:     { label: 'All horses',      test: () => true },
  pending: { label: 'Coggins pending', test: (h) => h.boarder_completed && h.coggins_status === 'missing' },
  expired: { label: 'Coggins expired', test: (h) => h.coggins_status === 'expired' },
  drafts:  { label: 'Not submitted',   test: (h) => !h.boarder_completed },
}

export default function HorseGrid({ refreshSignal, isAdmin }) {
  const [horses, setHorses] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)

  async function loadHorses() {
    setLoading(true)
    const { data } = await supabase.from('horses')
      .select(HORSE_WITH_OWNER_SELECT)
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
    if (!FILTERS[filter].test(h)) return false
    const owner = h.owner?.full_name || h.owner?.email || ''
    return h.name.toLowerCase().includes(term) || owner.toLowerCase().includes(term)
  })
  const pendingCount = horses.filter(FILTERS.pending.test).length

  return (
    <div className="horse-gallery">
      <h3>All horses</h3>
      <div className="horse-grid-controls">
        <input placeholder="Search by horse or owner..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter horses">
          {Object.entries(FILTERS).map(([key, f]) => (
            <option key={key} value={key}>
              {f.label}{key === 'pending' && pendingCount ? ` (${pendingCount})` : ''}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted">No horses to show.</p>
      ) : (
        <div className="horse-grid">
          {visible.map((h) => {
            const owner = ownerName(h.owner)
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
                  <div className="horse-tile-meta">
                    {!h.boarder_completed
                      ? <span className="coggins-badge coggins-badge--draft">Not submitted</span>
                      : h.coggins_status !== 'current' &&
                        <span className={`coggins-badge coggins-badge--${h.coggins_status}`}>{STATUS_LABEL[h.coggins_status]}</span>}
                  </div>
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
  ['behavior_notes', 'Behavior & handling notes'],
  ['intro_story', 'Short intro story'],
]
// Not here on purpose: emergency contact and photo consent belong to the
// owner's profile, so they're shown below but edited by the boarder under
// "My account" (admins can also change them from the profiles table).

function HorseDetail({ horse, isAdmin, onBack, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(horse)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const owner = ownerName(horse.owner)

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
        <label className="field-label">{labelText}</label>
        {field === 'boarding_date' ? (
          <input type="date" value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
        ) : field === 'behavior_notes' || field === 'intro_story' ? (
          <textarea value={form[field] || ''} onChange={(e) => update(field, e.target.value)} rows={3} />
        ) : (
          <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
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
      </div>

      <h4 className="print-section-heading print-section-heading--spaced">Owner</h4>
      <div className="print-grid">
        <DisplayField label="Owner phone" value={formatPhone(horse.owner?.phone)} />
        <DisplayField label="Emergency contact" value={emergencyContactText(horse.owner) || 'Not provided'} />
        <DisplayField label="Photo sharing" value={photoConsentText(horse.owner)} />
        <DisplayField label="Coggins" value={cogginsText(horse)} />
      </div>

      <div className="print-notes">
        <DisplayField label="Behavior & handling notes" value={horse.behavior_notes} />
        <DisplayField label="Short intro story" value={horse.intro_story} />
      </div>

      <MedicalRecords horse={horse} role={isAdmin ? 'admin' : 'staff'} onChanged={onSaved} />

    </div>
  )
}