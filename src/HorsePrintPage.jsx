import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// Moved OUT of the component below — defined once, stable identity
function Field({ label, value }) {
  return (
    <div className="print-field">
      <div className="print-field-label">{label}</div>
      <div className="print-field-value">{value || '—'}</div>
    </div>
  )
}

export default function HorsePrintPage() {
  const { horseId } = useParams()
  const navigate = useNavigate()
  const [horse, setHorse] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('horses')
      .select('*, owner:profiles(full_name, email, phone)')
      .eq('id', horseId)
      .single()
      .then(({ data }) => { setHorse(data); setLoading(false) })
  }, [horseId])

  if (loading) return <p className="page-loading">Loading...</p>
  if (!horse) return <p className="page-loading">Horse not found.</p>

  const owner = horse.owner?.full_name || horse.owner?.email || 'Unassigned'

  return (
    <div className="print-page print-sheet">
      {/* Controls — hidden when printing */}
      <div className="no-print print-controls">
        <button className="btn" onClick={() => window.print()}>
          Print this sheet
        </button>
        <button className="btn-secondary" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      {/* The sheet */}
      <div className="print-header">
        <h1>{horse.name}</h1>
      </div>

      <div className="print-top-row">
        <div className="print-photo">
          {horse.photo_url
            ? <img src={horse.photo_url} alt={horse.name} />
            : <span className="print-photo-placeholder">🐴</span>}
        </div>
        <div className="print-fields">
          <Field label="Breed" value={horse.breed} />
          <Field label="Sex" value={horse.sex} />
          <Field label="Age" value={horse.age} />
          <Field label="Color" value={horse.color} />
          <Field label="Boarding date" value={horse.boarding_date} />
        </div>
      </div>

      <h3 className="print-section-heading">Care (barn-managed)</h3>
      <div className="print-grid">
        <Field label="Stall" value={horse.stall_number} />
        <Field label="Pasture" value={horse.pasture} />
        <Field label="Hay" value={horse.hay} />
        <Field label="Grain" value={horse.grain} />
        <Field label="Turnout" value={horse.turnout} />
      </div>

      <h3 className="print-section-heading print-section-heading--spaced">Owner-provided</h3>
      <div className="print-grid">
        <Field label="Supplements" value={horse.supplements} />
        <Field label="Medications" value={horse.medications} />
        <Field label="Veterinarian" value={horse.vet_info} />
        <Field label="Farrier" value={horse.farrier_info} />
        <Field label="Emergency contacts" value={horse.emergency_contacts} />
      </div>

      <div className="print-notes">
        <Field label="Behavior & handling notes" value={horse.behavior_notes} />
      </div>
    </div>
  )
}