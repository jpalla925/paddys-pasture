import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Who can do what mirrors the database rules (migration 161034). The database
// is the real guard; these only decide which buttons to show, so nobody is
// offered an action that would be refused.
//   Coggins:       boarder (own horse, any time) and admin can upload; admin can delete
//   Other records: boarder (own horse, until submitted) and admin can upload
//   Staff:         view only
function permissionsFor(role, horse) {
  const isAdmin = role === 'admin'
  const isBoarder = role === 'boarder'
  return {
    canUploadCoggins: isAdmin || isBoarder,
    canUploadOther: isAdmin || (isBoarder && !horse.boarder_completed),
    canDeleteCoggins: isAdmin,
  }
}

// Shared with the horse tiles so the badge wording lives in one place.
export const STATUS_LABEL = {
  missing: 'Coggins pending',
  expired: 'Coggins expired',
  current: 'Coggins current',
}

function formatDate(isoDate) {
  // Dates from Postgres are 'YYYY-MM-DD'; parse as local so they don't shift a day.
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString()
}

function todayIso() {
  const now = new Date()
  const off = now.getTimezoneOffset() * 60000
  return new Date(now - off).toISOString().slice(0, 10)
}

// Props:
//   horse        needs id, owner_id, boarder_completed. If the parent selected
//                the computed columns (coggins_status, coggins_expires_on), the
//                status badge is shown.
//   role         'admin' | 'staff' | 'boarder'
//   cogginsOnly  show just the Coggins section (used in the boarder's horse form)
//   onChanged    called after an upload or delete, so the parent can refresh status
export default function MedicalRecords({ horse, role, cogginsOnly = false, onChanged }) {
  const [records, setRecords] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [testDate, setTestDate] = useState('')

  const perms = permissionsFor(role, horse)

  async function load() {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('horse_id', horse.id)
      .order('created_at', { ascending: false })
    if (error) { setError('Could not load records: ' + error.message); return }
    setRecords(data ?? [])
  }

  useEffect(() => { load() }, [horse.id])

  async function upload(file, recordType) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB.'); return }
    if (recordType === 'coggins' && !testDate) { setError('Please enter the Coggins test date first.'); return }

    setBusy(true)
    setError('')

    // Path is always {owner_id}/{horse_id}/... -- even when an admin uploads --
    // because the storage rules check it, and the boarder's read access is by folder.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${horse.owner_id}/${horse.id}/${Date.now()}-${safeName}`

    const { error: upErr } = await supabase.storage.from('medical-records').upload(path, file)
    if (upErr) { setError('Upload failed: ' + upErr.message); setBusy(false); return }

    // uploaded_by is filled in by the database from the logged-in user.
    const { error: rowErr } = await supabase.from('medical_records').insert({
      horse_id: horse.id,
      file_path: path,
      file_name: file.name,
      record_type: recordType,
      test_date: recordType === 'coggins' ? testDate : null,
    })
    if (rowErr) { setError('Saved the file but could not record it: ' + rowErr.message); setBusy(false); return }

    setTestDate('')
    await load()
    setBusy(false)
    onChanged?.()
  }

  async function removeCoggins(record) {
    if (!window.confirm(`Delete the Coggins "${record.file_name}"? This can't be undone.`)) return
    setBusy(true)
    setError('')

    // Row first: it decides the Coggins status. .select() returns the deleted
    // rows, so a delete the database quietly refused (0 rows) is caught here.
    const { data, error: rowErr } = await supabase
      .from('medical_records').delete().eq('id', record.id).select('id')
    if (rowErr || !data?.length) {
      setError('Could not delete: ' + (rowErr?.message || 'not allowed'))
      setBusy(false)
      return
    }

    // Then the file. If this fails, only an unreferenced private file is left.
    const { error: fileErr } = await supabase.storage.from('medical-records').remove([record.file_path])
    if (fileErr) console.error('Coggins row deleted but file remains:', record.file_path, fileErr)

    await load()
    setBusy(false)
    onChanged?.()
  }

  // Private bucket: generate a temporary signed URL to view a file
  async function openRecord(path) {
    const { data, error } = await supabase.storage.from('medical-records').createSignedUrl(path, 60)
    if (error) { alert('Could not open file: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const coggins = records.filter((r) => r.record_type === 'coggins')
  const others = records.filter((r) => r.record_type !== 'coggins')

  return (
    <div className="medical-records">
      {/* ----- Coggins ----- */}
      <h4 className="print-section-heading print-section-heading--spaced">
        Coggins
        {horse.coggins_status && (
          <span className={`coggins-badge coggins-badge--${horse.coggins_status}`}>
            {STATUS_LABEL[horse.coggins_status]}
            {horse.coggins_status !== 'missing' && horse.coggins_expires_on &&
              ` · ${horse.coggins_status === 'expired' ? 'expired' : 'expires'} ${formatDate(horse.coggins_expires_on)}`}
          </span>
        )}
      </h4>

      {coggins.length === 0 ? (
        <p className="text-muted">
          No Coggins on file{horse.coggins_to_barn ? ' — owner is bringing it to the barn.' : '.'}
        </p>
      ) : (
        <ul className="record-list">
          {coggins.map((r) => (
            <li key={r.id}>
              <span className="record-icon" aria-hidden="true">📄</span>
              <button className="btn-link" onClick={() => openRecord(r.file_path)}>{r.file_name}</button>
              <span className="text-muted record-date">Tested {formatDate(r.test_date)}</span>
              {perms.canDeleteCoggins && (
                <button className="btn-link record-delete" onClick={() => removeCoggins(r)} disabled={busy}>
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {perms.canUploadCoggins && (
        <div className="coggins-upload">
          <label className="field-label">Coggins test date</label>
          <input type="date" value={testDate} max={todayIso()}
            onChange={(e) => setTestDate(e.target.value)} disabled={busy} />
          <label className={`btn btn-secondary record-upload-btn${!testDate || busy ? ' is-disabled' : ''}`}>
            {busy ? 'Uploading...' : coggins.length ? '+ Upload a newer Coggins' : '+ Upload Coggins'}
            <input type="file" accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => { upload(e.target.files?.[0], 'coggins'); e.target.value = '' }}
              disabled={!testDate || busy} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* ----- Other medical records ----- */}
      {!cogginsOnly && (
        <>
          <h4 className="print-section-heading print-section-heading--spaced">Medical records</h4>
          {others.length === 0 ? (
            <p className="text-muted">No records uploaded.</p>
          ) : (
            <ul className="record-list">
              {others.map((r) => (
                <li key={r.id}>
                  <span className="record-icon" aria-hidden="true">📄</span>
                  <button className="btn-link" onClick={() => openRecord(r.file_path)}>{r.file_name}</button>
                  <span className="text-muted record-date">{new Date(r.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}

          {perms.canUploadOther && (
            <label className={`btn btn-secondary record-upload-btn${busy ? ' is-disabled' : ''}`}>
              {busy ? 'Uploading...' : '+ Upload record'}
              <input type="file" accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => { upload(e.target.files?.[0], 'other'); e.target.value = '' }}
                disabled={busy} style={{ display: 'none' }} />
            </label>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  )
}