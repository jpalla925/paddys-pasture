import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

export default function BoarderMessages({ userId }) {
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  // Load this boarder's thread, then listen for new messages live
  useEffect(() => {
    supabase.from('messages').select('*').eq('boarder_id', userId).order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    const channel = supabase
      .channel('boarder-thread-' + userId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `boarder_id=eq.${userId}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // Keep the newest message in view
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      boarder_id: userId, sender_id: userId, body: body.trim(),
    })
    if (error) {
      console.error('Send failed:', error)
      alert('Send failed: ' + error.message)
    } else {
      setBody('')
    }
    if (!error) setBody('')
    setSending(false)
  }

  return (
    <div className="chat-panel">
      <h3>Message the barn</h3>

      <div className="chat-messages">
        {messages.length === 0
          ? <p className="text-muted">No messages yet. Send one below.</p>
          : messages.map((m) => {
              const mine = m.sender_id === userId
              return (
                <div key={m.id} className={`chat-row ${mine ? 'chat-row--mine' : ''}`}>
                  <span className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
                    {m.body}
                  </span>
                  <div className="chat-meta">{mine ? 'You' : 'Barn staff'}</div>
                </div>
              )
            })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="chat-form">
        <input value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message about your horse..."
          className="chat-input" />
        <button type="submit" className="btn" disabled={sending}>
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}