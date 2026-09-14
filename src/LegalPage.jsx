// Shared shell for the public legal pages (SMS terms, privacy policy).
// These render without a session — reviewers and carriers need to reach
// them without an account.

export default function LegalPage({ title, updated, children }) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <h1>Paddy's Pastures</h1>
      </header>

      <main className="legal-body">
        <h2>{title}</h2>
        {children}
        <p className="legal-updated">Last updated: {updated}</p>
      </main>

      <footer className="legal-footer">
        <a href="/">Return to Paddy's Pastures</a>
      </footer>
    </div>
  )
}