import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

// Moved OUT of the component below — defined once, stable identity
function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8A5A34' }}>{label}</div>
      <div style={{ fontSize: 15 }}>{value || '—'}</div>
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

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>
  if (!horse) return <p style={{ padding: 40 }}>Horse not found.</p>

  const owner = horse.owner?.full_name || horse.owner?.email || 'Unassigned'

  return (
    <div className="print-page" style={{ maxWidth: 720, margin: '0 auto', padding: 40, fontFamily: 'sans-serif', color: '#22302a' }}>
      {/* Controls — hidden when printing */}
      <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
        <button onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#2F4A3D', color: 'white', border: 'none', borderRadius: 4 }}>
          Print this sheet
        </button>
        <button onClick={() => navigate(-1)}
          style={{ padding: '8px 16px', background: '#eee', border: 'none', borderRadius: 4 }}>
          Back
        </button>
      </div>

      {/* The sheet */}
      <div style={{ borderBottom: '3px solid #2F4A3D', paddingBottom: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0, color: '#2F4A3D' }}>{horse.name} <span style={{ fontWeight: 400, color: '#8A5A34' }}>({owner})</span></h1>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div style={{ width: 180, height: 180, background: '#e7e2d6', borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {horse.photo_url
            ? <img src={horse.photo_url} alt={horse.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 60 }}>🐴</span>}
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Sex" value={horse.sex} />
          <Field label="Age" value={horse.age} />
          <Field label="Color" value={horse.color} />
          <Field label="Boarding date" value={horse.boarding_date} />
        </div>
      </div>

      <h3 style={{ color: '#2F4A3D', borderBottom: '1px solid #d8d2c4', paddingBottom: 4 }}>Care (barn-managed)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Stall" value={horse.stall_number} />
        <Field label="Pasture" value={horse.pasture} />
        <Field label="Hay" value={horse.hay} />
        <Field label="Grain" value={horse.grain} />
        <Field label="Turnout" value={horse.turnout} />
      </div>

      <h3 style={{ color: '#2F4A3D', borderBottom: '1px solid #d8d2c4', paddingBottom: 4, marginTop: 20 }}>Owner-provided</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Supplements" value={horse.supplements} />
        <Field label="Medications" value={horse.medications} />
        <Field label="Veterinarian" value={horse.vet_info} />
        <Field label="Farrier" value={horse.farrier_info} />
        <Field label="Emergency contacts" value={horse.emergency_contacts} />
        <Field label="Owner phone" value={horse.owner?.phone} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Behavior & handling notes" value={horse.behavior_notes} />
      </div>
    </div>
  )
}