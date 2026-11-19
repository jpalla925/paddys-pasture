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
import InstallPrompt from './InstallPrompt';
import AccountDetails from './AccountDetails'

// What RequireAuth needs to decide which onboarding step (if any) to show.
const PROFILE_SELECT = 'full_name, role, must_change_password, emergency_contact_phone, photo_permission'

// Boarders need an emergency contact and a photo answer before anything else.
// (Horses can't be submitted without them either -- enforced in the database,
// migration 161036. This just gets them filled in up front.)
function needsProfileDetails(profile) {
  return profile?.role === 'boarder' &&
    (!profile.emergency_contact_phone || profile.photo_permission === null || profile.photo_permission === undefined)
}

function MainApp({ session, profile, refreshKey, setRefreshKey }) {
  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'
  const isBoarder = profile?.role === 'boarder'
  const [showAccount, setShowAccount] = useState(false)

  return (
    <div className="container">
      <div className="app-header">
        <div>
          <h2>Paddy's Pastures</h2>
          <small className="text-muted">{profile?.full_name || session.user.email} — {profile?.role ?? '...'}</small>
        </div>
        <div className="app-header-actions">
          <InstallPrompt variant="nav" />
          {isBoarder && (
            <button className="btn-secondary" onClick={() => setShowAccount((v) => !v)}>
              {showAccount ? 'Close account' : 'My account'}
            </button>
          )}
          <button className="btn-secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <InstallPrompt variant="banner" />

      {isBoarder && showAccount && (
        <AccountDetails userId={session.user.id} mode="account"
          onDone={() => setShowAccount(false)} onCancel={() => setShowAccount(false)} />
      )}

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
  const [profileError, setProfileError] = useState('')
  const [loading, setLoading] = useState(true)
  const [profileVersion, setProfileVersion] = useState(0)   // bump to re-read the profile

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
    supabase.from('profiles').select(PROFILE_SELECT).eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setProfileError('Could not load your account: ' + error.message)
        else { setProfile(data); setProfileError('') }
      })
    return () => { active = false }
  }, [session, profileVersion])

  const reloadProfile = () => setProfileVersion((v) => v + 1)

  if (loading) return <p className="page-loading">Loading...</p>
  if (!session) return <Auth />
  if (profileError) return <p className="page-loading">{profileError}</p>
  // Wait for the profile: without it we can't tell which steps are needed
  // (and an admin would briefly see the boarder view).
  if (!profile) return <p className="page-loading">Loading...</p>

  // Force temp-password users to set a real one before anything else
  if (profile?.must_change_password) {
    return (
      <ChangePassword
        userId={session.user.id}
        role={profile?.role}
        onDone={reloadProfile}
      />
    )
  }

  // Boarders who finished setup before the emergency contact and photo
  // question existed get a one-time catch-up step.
  if (needsProfileDetails(profile)) {
    return <AccountDetails userId={session.user.id} mode="onboarding" onDone={reloadProfile} />
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