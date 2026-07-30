export default function DisplayField({ label, value }) {
  return (
    <div className="display-field">
      <div className="display-field-label">{label}</div>
      <div className="display-field-value">{value || '—'}</div>
    </div>
  )
}