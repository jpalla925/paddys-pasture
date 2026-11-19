// How barn screens (HorseGrid, HorsePrintPage) fetch and show the owner's
// details. Emergency contact and photo consent live on the OWNER's profile
// (migration 161035), so a horse reads them through owner_id rather than
// keeping its own copy.
import { STATUS_LABEL } from './MedicalRecords'

// The select string for a horse row plus its owner and derived Coggins status.
export const HORSE_WITH_OWNER_SELECT =
  '*, coggins_status, coggins_expires_on, ' +
  'owner:profiles(full_name, email, phone, ' +
  'emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, ' +
  'photo_permission, photo_permission_updated_at)'

export function formatPhone(digits) {
  const d = String(digits ?? '').replace(/\D/g, '')
  if (d.length !== 10) return digits || ''
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function ownerName(owner) {
  return owner?.full_name || owner?.email || 'Unassigned'
}

export function emergencyContactText(owner) {
  if (!owner?.emergency_contact_phone) return ''
  return `${owner.emergency_contact_name} (${owner.emergency_contact_relationship}) · ` +
    formatPhone(owner.emergency_contact_phone)
}

export function photoConsentText(owner) {
  if (owner?.photo_permission == null) return 'Not answered'
  const since = owner.photo_permission_updated_at
    ? ` (since ${new Date(owner.photo_permission_updated_at).toLocaleDateString()})`
    : ''
  return (owner.photo_permission ? 'Yes' : 'No') + since
}

function formatDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString()
}

export function cogginsText(horse) {
  if (!horse?.coggins_status) return ''
  if (horse.coggins_status === 'missing') {
    return STATUS_LABEL.missing + (horse.coggins_to_barn ? ' (owner bringing it to the barn)' : '')
  }
  const verb = horse.coggins_status === 'expired' ? 'expired' : 'expires'
  return `${STATUS_LABEL[horse.coggins_status]} · ${verb} ${formatDate(horse.coggins_expires_on)}`
}