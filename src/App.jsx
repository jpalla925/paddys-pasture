import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import HorseGrid from './HorseGrid'
import NewBoardedHorses from './NewBoardedHorses'
import BoarderHorseView from './BoarderHorseView'
import BoarderMessages from './BoarderMessages'
import StaffInbox from './StaffInbox'
import HorsePrintPage from './HorsePrintPage'
import AddPersonForm from './AddPersonForm'
import ChangePassword from './ChangePassword'
import TreatmentChecklist from './TreatmentChecklist'
import ReplyByLink from './ReplyByLink'
import InstallPrompt from './Installprompt';

function MainApp({ session, profile, refreshKey, setRefreshKey }) {
  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'

  return (
    <div className="container">
      <div className="app-header">
        <div>
          <h2>Paddy's Pastures</h2>
          <small className="text-muted">{profile?.full_name || session.user.email} — {profile?.role ?? '...'}</small>
        </div>
        <div className="app-header-actions">
          <InstallPrompt variant="nav" />
          <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <InstallPrompt variant="banner" />

      {(isAdmin || isStaff) ? (
        <>
          {isAdmin && <AddPersonForm onAdded={() => setRefreshKey((k) => k + 1)} />}
          {isAdmin && <NewBoardedHorses refreshSignal={refreshKey} onSaved={() => setRefreshKey((k) => k + 1)} />}
          <TreatmentChecklist userId={session.user.id} />
          <HorseGrid refreshSignal={refreshKey} isAdmin={isAdmin} />
          <hr className="divider" />
          <StaffInbox userId={session.user.id} />  
        </>
      ) : (
        <>
          <BoarderHorseView userId={session.user.id} />
          <hr className="divider" />
          <BoarderMessages userId={session.user.id} />
        </>
      )}
    </div>
  )
}

// Wraps the private side of the app. Everything inside requires a session
// and a completed first-login setup. Public routes bypass this entirely.
function RequireAuth({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) return <p className="page-loading">Loading...</p>
  if (!session) return <Auth />

  // Force temp-password users to set a real one before anything else
  if (profile?.must_change_password) {
    return (
      <ChangePassword
        userId={session.user.id}
        role={profile?.role}
        onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))}
      />
    )
  }

  return children({ session, profile })
}

function App() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <Routes>
      {/* Public. Static pages (/about, /privacy, /sms-terms) live in public/.
          React's public routes go here, ABOVE the catch-all, outside RequireAuth.
          /r/:token is secured by the token itself: every read and write goes
          through thread_via_token() / reply_via_token() in the database. */}
      <Route path="/r/:token" element={<ReplyByLink />} />

      {/* Private */}
      <Route path="/horse/:horseId/print" element={
        <RequireAuth>{() => <HorsePrintPage />}</RequireAuth>
      } />
      <Route path="*" element={
        <RequireAuth>
          {({ session, profile }) => (
            <MainApp
              session={session}
              profile={profile}
              refreshKey={refreshKey}
              setRefreshKey={setRefreshKey}
            />
          )}
        </RequireAuth>
      } />
    </Routes>
  )
}

export default App