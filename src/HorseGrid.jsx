import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Link } from 'react-router-dom'

export default function HorseGrid({ refreshSignal }) {
  const [horses, setHorses] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.from('horses')
      .select('id, name, photo_url, stall_number, owner:profiles(full_name, email)')
      .order('name')
      .then(({ data }) => { setHorses(data ?? []); setLoading(false) })
  }, [refreshSignal])

  const term = search.trim().toLowerCase()
  const visible = horses.filter((h) => {
    const owner = h.owner?.full_name || h.owner?.email || ''
    return h.name.toLowerCase().includes(term) || owner.toLowerCase().includes(term)
  })

  if (loading) return <p>Loading horses...</p>

  return (
    <div>
      <input placeholder="Search by horse or owner..." value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: 8, width: '100%', maxWidth: 420, marginBottom: 16 }} />

      {visible.length === 0 ? (
        <p style={{ color: '#777' }}>No horses to show.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
          {visible.map((h) => {
            const owner = h.owner?.full_name || h.owner?.email || 'Unassigned'
            return (
              <div key={h.id} style={{ border: '1px solid #d8d2c4', borderRadius: 8, overflow: 'hidden', background: '#fbf9f5' }}>
                <div style={{ height: 120, background: '#e7e2d6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {h.photo_url
                    ? <img src={h.photo_url} alt={h.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 40 }}>🐴</span>}
                </div>
                <div style={{ padding: 10 }}>
                  <strong style={{ color: '#2F4A3D' }}>{h.name}</strong>
                  <div style={{ fontSize: 13, color: '#8A5A34' }}>({owner})</div>
                  {h.stall_number && <div style={{ fontSize: 12, color: '#777' }}>Stall {h.stall_number}</div>}
                  <Link to={`/horse/${h.id}/print`} className="no-print"
                    style={{ fontSize: 12, color: '#2F4A3D', display: 'block', marginTop: 6 }}>
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