import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'

// Public reply page: /r/:token (no login).
//
// Opened from the SMS sent by notify-message. The page has no special access
// of its own: everything goes through two SECURITY DEFINER database functions,
// which validate the token on every call:
//   thread_via_token(token)       -> boarder name, recipient first name, last 10 messages
//   reply_via_token(token, body)  -> posts a reply into that boarder's thread
// Without a valid token, this page can't read or write anything.

const MAX_LEN = 2000
const BARN_PHONE = '(941) 442-5648'

function formatTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function ReplyByLink() {
  const { token } = useParams()
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'invalid'
  const [thread, setThread] = useState(null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const bottomRef = useRef(null)

  // Apply a thread_via_token result. An error means the link is bad or expired;
  // the database deliberately doesn't say which.
  const apply = useCallback(({ data, error }) => {
    if (error || !data) {
      setStatus('invalid')
      return
    }
    setThread(data)
    setStatus('ready')
  }, [])

  const load = useCallback(
    () => supabase.rpc('thread_via_token', { p_token: token }).then(apply),
    [token, apply],
  )

  // Initial load (same pattern as BoarderMessages: set state in the callback)
  useEffect(() => {
    let active = true
    supabase.rpc('thread_via_token', { p_token: token })
      .then((res) => { if (active) apply(res) })
    return () => { active = false }
  }, [token, apply])

  // Keep the newest message in view
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread])

  async function send(e) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setSending(true)
    setError('')
    setSent(false)

    const { error } = await supabase.rpc('reply_via_token', { p_token: token, p_body: text })
    if (error) {
      setError(error.message) // friendly messages come from the database function
    } else {
      setBody('')
      setSent(true)
      await load() // show the reply in context; also catches a link that just expired
    }
    setSending(false)
  }

  if (status === 'loading') return <p className="page-loading">Loading...</p>

  if (status === 'invalid') {
    return (
      <div className="container">
        <div className="card form-narrow">
          <h3>Paddy's Pastures</h3>
          <p>This link is invalid or has expired.</p>
          <p className="text-muted">
            Reply in the app, or call the barn at <a href={`tel:${BARN_PHONE.replace(/\D/g, '')}`}>{BARN_PHONE}</a>.
          </p>
        </div>
      </div>
    )
  }

  const { boarder_name, recipient_first_name, expires_at, messages } = thread
  const boarderName = boarder_name || 'Boarder'

  return (
    <div className="container">
      <div className="chat-panel">
        <h3>Paddy's Pastures</h3>
        <p className="text-muted">
          {recipient_first_name ? `Hi ${recipient_first_name}. ` : ''}
          Conversation with <strong>{boarderName}</strong>
        </p>

        <div className="chat-messages">
          {messages.length === 0
            ? <p className="text-muted">No messages yet.</p>
            : messages.map((m, i) => {
                const fromBarn = !m.from_boarder
                return (
                  <div key={i} className={`chat-row ${fromBarn ? 'chat-row--mine' : ''}`}>
                    <span className={`chat-bubble ${fromBarn ? 'chat-bubble--mine' : ''}`}>
                      {m.body}
                    </span>
                    <div className="chat-meta">
                      {fromBarn ? 'Barn' : boarderName} · {formatTime(m.created_at)}
                    </div>
                  </div>
                )
              })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="chat-form">
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setSent(false) }}
            placeholder={`Reply to ${boarderName}...`}
            className="chat-input"
            rows={3}
            maxLength={MAX_LEN}
          />
          <button type="submit" className="btn" disabled={sending || !body.trim()}>
            {sending ? '...' : 'Send'}
          </button>
        </form>

        {body.length > MAX_LEN - 200 && (
          <p className="text-muted"><small>{body.length} / {MAX_LEN}</small></p>
        )}
        {sent && <p className="form-message">Sent ✓</p>}
        {error && <p className="form-error">{error}</p>}

        <p className="text-muted">
          <small>
            This link works until {formatTime(expires_at)}.{' '}
            <button type="button" className="btn-link" onClick={load}>Refresh</button>
          </small>
        </p>
      </div>
    </div>
  )
}