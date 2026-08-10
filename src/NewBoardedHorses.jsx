import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const BARN_FIELDS = [
  ['stall_number', 'Stall number'],
  ['hay', 'Hay'],
  ['grain', 'Grain'],
  ['pasture', 'Pasture'],
  ['turnout', 'Turnout'],
]

export default function NewBoardedHorses({ refreshSignal }) {
  const [horses, setHorses] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    // Horses with no stall assigned yet = still need barn setup
    const { data } = await supabase
      .from('horses')
      .select('*, owner:profiles(full_name, email)')
      .is('stall_number', null)
      .order('created_at')
    setHorses(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [refreshSignal])

  if (loading) return <p>Loading...</p>

  return (
    <div className="card">
      <h3>New boarded horses</h3>
      <p className="text-muted">Horses waiting for barn setup (stall, feeding, pasture, turnout).</p>

      {horses.length === 0 ? (
        <p className="text-muted">All caught up — no horses waiting for setup.</p>
      ) : (
        horses.map((horse) => <BarnSetupRow key={horse.id} horse={horse} onDone={load} />)
      )}
    </div>
  )
}

function BarnSetupRow({ horse, onDone }) {
  const [form, setForm] = useState(horse)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const owner = horse.owner?.full_name || horse.owner?.email || 'Unknown owner'

  async function save() {
    if (!String(form.stall_number ?? '').trim()) {
      setMessage('Stall number is required.')
      return
    }
    setSaving(true)
    setMessage('')
    const updates = {}
    for (const [field] of BARN_FIELDS) {
      updates[field] = String(form[field] ?? '').trim() || null
    }
    const { error } = await supabase.from('horses').update(updates).eq('id', horse.id)
    if (error) { setMessage('Error: ' + error.message); setSaving(false); return }
    await onDone()   // reloads; this horse drops off the queue
  }

  return (
    <div className="card horse-card">
      <h4 className="text-saddle">{horse.name} <span className="text-muted" style={{ fontSize: 13 }}>({owner})</span></h4>
      {BARN_FIELDS.map(([field, labelText]) => (
        <div key={field}>
          <label className="field-label">{labelText}</label>
          <input value={form[field] || ''} onChange={(e) => update(field, e.target.value)} />
        </div>
      ))}
      <div className="horse-card-actions">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save barn info'}
        </button>
      </div>
      {message && <p className="form-message">{message}</p>}
    </div>
  )
}