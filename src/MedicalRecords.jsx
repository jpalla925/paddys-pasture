import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function MedicalRecords({ horse, userId, canUpload }) {
  const [records, setRecords] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase
      .from('medical_records')
      .select('*')
      .eq('horse_id', horse.id)
      .order('created_at', { ascending: false })
    setRecords(data ?? [])
  }

  useEffect(() => { load() }, [horse.id])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10MB.'); return }

    setUploading(true)
    setError('')

    // Path encodes ownership: {userId}/{horseId}/{filename} — required by the storage policy
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId}/${horse.id}/${Date.now()}-${safeName}`

    const { error: upErr } = await supabase.storage
      .from('medical-records')
      .upload(path, file)
    if (upErr) { setError('Upload failed: ' + upErr.message); setUploading(false); return }

    // Record the reference in the table
    const { error: rowErr } = await supabase.from('medical_records').insert({
      horse_id: horse.id,
      file_path: path,
      file_name: file.name,
      uploaded_by: userId,
    })
    if (rowErr) { setError('Saved file but failed to record it: ' + rowErr.message); setUploading(false); return }

    await load()
    setUploading(false)
  }

  // Private bucket: generate a temporary signed URL to view a file
  async function openRecord(path) {
    const { data, error } = await supabase.storage
      .from('medical-records')
      .createSignedUrl(path, 60)   // valid for 60 seconds
    if (error) { alert('Could not open file: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="medical-records">
      <h4 className="print-section-heading print-section-heading--spaced">Medical records</h4>

      {records.length === 0 ? (
        <p className="text-muted">No records uploaded.</p>
      ) : (
        <ul className="record-list">
          {records.map((r) => (
            <li key={r.id}>
              <span className="record-icon" aria-hidden="true">📄</span>
              <button className="btn-link" onClick={() => openRecord(r.file_path)}>
                {r.file_name}
              </button>
              <span className="text-muted record-date">{new Date(r.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <label className="btn btn-secondary record-upload-btn">
          {uploading ? 'Uploading...' : '+ Upload record'}
          <input type="file" accept="application/pdf,image/jpeg,image/png"
            onChange={handleFile} disabled={uploading} style={{ display: 'none' }} />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}