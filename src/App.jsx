import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import HorseGrid from './HorseGrid'
import CreateHorseForm from './CreateHorseForm'
import BoarderHorseView from './BoarderHorseView'
import BoarderMessages from './BoarderMessages'
import StaffInbox from './StaffInbox'
import HorsePrintPage from './HorsePrintPage'
import AddPersonForm from './AddPersonForm'
import ChangePassword from './ChangePassword'

function MainApp({ session, profile, refreshKey, setRefreshKey }) {
  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: '#2F4A3D', margin: 0 }}>Paddy's Pasture</h2>
          <small>{session.user.email} — {profile?.role ?? '...'}</small>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ padding: 8 }}>Sign out</button>
      </div>

      {(isAdmin || isStaff) ? (
        <>
          {isAdmin && <AddPersonForm onAdded={() => setRefreshKey((k) => k + 1)} />}
          {isAdmin && <CreateHorseForm refreshSignal={refreshKey} onCreated={() => setRefreshKey((k) => k + 1)} />}
          <HorseGrid refreshSignal={refreshKey} />
          <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #d8d2c4' }} />
          <StaffInbox userId={session.user.id} />
        </>
      ) : (
        <>
          <BoarderHorseView userId={session.user.id} />
          <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid #d8d2c4' }} />
          <BoarderMessages userId={session.user.id} />
        </>
      )}
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false)
    })
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    let active = true
    supabase.from('profiles').select('full_name, role, must_change_password').eq('id', session.user.id).single()
      .then(({ data }) => { if (active) setProfile(data) })
    return () => { active = false }
  }, [session])

  if (loading) return <p style={{ padding: 40 }}>Loading...</p>
  if (!session) return <Auth />
  
  // Force temp-password users to set a real one before anything else
  if (profile?.must_change_password) {
    return (
      <ChangePassword
        userId={session.user.id}
        onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))}
      />
    )
  }

  return (
    <Routes>
      <Route path="/horse/:horseId/print" element={<HorsePrintPage />} />
      <Route path="*" element={<MainApp session={session} profile={profile} refreshKey={refreshKey} setRefreshKey={setRefreshKey} />} />
    </Routes>
  )
}

export default App