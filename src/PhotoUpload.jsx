import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function PhotoUpload({ currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    // Basic guardrails
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.')
      return
    }

    setUploading(true)
    setError('')

    // Unique filename so uploads don't overwrite each other
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('horse-photos')
      .upload(path, file)

    if (upErr) {
      setError('Upload failed: ' + upErr.message)
      setUploading(false)
      return
    }

    // Get the public URL to save on the horse
    const { data } = supabase.storage.from('horse-photos').getPublicUrl(path)
    onUploaded(data.publicUrl)
    setUploading(false)
  }

  return (
    <div className="photo-upload">
      {currentUrl && (
        <img src={currentUrl} alt="Horse" className="photo-upload-preview" />
      )}
      <label className="btn btn-secondary">
        {uploading ? 'Uploading...' : currentUrl ? 'Change photo' : 'Upload photo'}
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading}
          style={{ display: 'none' }} />
      </label>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}