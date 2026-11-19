// The boarder's own details that every horse depends on: emergency contact and
// photo consent. Used in first-login setup (ChangePassword) and in
// AccountDetails (the catch-up step for existing boarders, and "My account").
// Validation and the DB column mapping live here too, so both screens agree.
//
// Database side: migration 161035 (columns, all-or-none, 10-digit phone, and
// the consent timestamp trigger). Horse submission checks these are filled in
// (161036).

export const EMPTY_PROFILE_DETAILS = {
  ecName: '',
  ecRelationship: '',
  ecPhone: '',
  photoPermission: null,   // null = not answered, true = yes, false = no
}

export function profileDetailsFromRow(row) {
  return {
    ecName: row?.emergency_contact_name || '',
    ecRelationship: row?.emergency_contact_relationship || '',
    ecPhone: row?.emergency_contact_phone || '',
    photoPermission: row?.photo_permission ?? null,
  }
}

// Returns a message for the first problem, or '' if everything is filled in.
export function validateProfileDetails(v) {
  if (!v.ecName.trim() || !v.ecRelationship.trim() || !v.ecPhone.trim()) {
    return 'Please enter an emergency contact: name, relationship, and phone.'
  }
  if (v.ecPhone.replace(/\D/g, '').length !== 10) {
    return "Please enter a valid 10-digit phone number for your emergency contact."
  }
  if (v.photoPermission === null) {
    return 'Please answer the photo sharing question.'
  }
  return ''
}

export function profileDetailsToColumns(v) {
  return {
    emergency_contact_name: v.ecName.trim(),
    emergency_contact_relationship: v.ecRelationship.trim(),
    emergency_contact_phone: v.ecPhone.replace(/\D/g, ''),
    photo_permission: v.photoPermission,
    // photo_permission_updated_at is stamped by the database, not sent from here.
  }
}

export default function ProfileDetailsFields({ value, onChange, disabled = false }) {
  const set = (key, val) => onChange({ ...value, [key]: val })

  return (
    <>
      <label className="field-label">Emergency contact</label>
      <p className="text-muted" style={{ fontSize: 13, marginTop: -4 }}>
        Someone the barn can call if there's an emergency and we can't reach you.
      </p>
      <div className="structured-subfields">
        <input placeholder="Name" value={value.ecName} disabled={disabled}
          onChange={(e) => set('ecName', e.target.value)} autoComplete="off" />
        <input placeholder="Relationship" value={value.ecRelationship} disabled={disabled}
          onChange={(e) => set('ecRelationship', e.target.value)} autoComplete="off" />
        <input type="tel" placeholder="Phone" value={value.ecPhone} disabled={disabled}
          onChange={(e) => set('ecPhone', e.target.value)} autoComplete="off" />
      </div>

      {/* Wording to confirm with Theresa. Deliberately no pre-selected answer. */}
      <label className="field-label">Photo sharing</label>
      <p style={{ marginTop: 0 }}>
        May Paddy's Pastures share photos of your horse(s), and of you if you're
        pictured, on the barn's social media? You can change your answer anytime
        under My account.
      </p>
      <label className="consent-row">
        <input type="radio" name="photo-permission" disabled={disabled}
          checked={value.photoPermission === true} onChange={() => set('photoPermission', true)} />
        <span>Yes, the barn may share photos</span>
      </label>
      <label className="consent-row">
        <input type="radio" name="photo-permission" disabled={disabled}
          checked={value.photoPermission === false} onChange={() => set('photoPermission', false)} />
        <span>No, please don't share photos</span>
      </label>
    </>
  )
}