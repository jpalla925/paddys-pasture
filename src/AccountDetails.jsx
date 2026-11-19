import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import ProfileDetailsFields, {
  EMPTY_PROFILE_DETAILS,
  profileDetailsFromRow,
  validateProfileDetails,
  profileDetailsToColumns,
} from './ProfileDetailsFields'

// Two uses, one screen:
//   mode="onboarding"  boarders who finished setup before these fields existed
//                      must fill them in before reaching the app (no Cancel)
//   mode="account"     "My account": change the photo answer or emergency
//                      contact at any time. Profiles never lock.
export default function AccountDetails({ userId, mode = 'account', onDone, onCancel }) {
  const [value, setValue] = useState(EMPTY_PROFILE_DETAILS)
  const [consentChangedAt, setConsentChangedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    supabase.from('profiles')
      .select('emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, photo_permission, photo_permission_updated_at')
      .eq('id', userId).single()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage('Could not load your details: ' + error.message)
        else {
          setValue(profileDetailsFromRow(data))
          setConsentChangedAt(data.photo_permission_updated_at)
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [userId])

  async function handleSubmit(e) {
    e.preventDefault()
    const problem = validateProfileDetails(value)
    if (problem) { setMessage(problem); return }

    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('profiles')
      .update(profileDetailsToColumns(value)).eq('id', userId)
    setSaving(false)
    if (error) { setMessage('Error saving: ' + error.message); return }
    onDone?.(value)
  }

  if (loading) return <p className="page-loading">Loading...</p>

  const onboarding = mode === 'onboarding'

  return (
    <div className={onboarding ? 'auth-page' : 'card'}>
      <h2>{onboarding ? 'A couple more details' : 'My account'}</h2>
      {onboarding && (
        <p className="text-muted">
          We've added two things the barn needs from every boarder. This only takes a minute.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <ProfileDetailsFields value={value} onChange={setValue} disabled={saving} />

        {!onboarding && consentChangedAt && (
          <p className="text-muted" style={{ fontSize: 13 }}>
            Photo answer last changed {new Date(consentChangedAt).toLocaleDateString()}.
          </p>
        )}

        <div className="horse-card-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving...' : onboarding ? 'Continue' : 'Save'}
          </button>
          {!onboarding && onCancel && (
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
        </div>
      </form>
      {message && <p className="form-error">{message}</p>}
    </div>
  )
}