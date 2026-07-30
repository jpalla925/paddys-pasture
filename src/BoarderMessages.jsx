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
    <div style={{ maxWidth: 480 }}>
      <h3 style={{ color: '#2F4A3D' }}>Message the barn</h3>

      <div style={{ border: '1px solid #d8d2c4', borderRadius: 8, padding: 12, height: 320,
        overflowY: 'auto', background: '#fbf9f5', marginBottom: 12 }}>
        {messages.length === 0
          ? <p style={{ color: '#777' }}>No messages yet. Send one below.</p>
          : messages.map((m) => {
              const mine = m.sender_id === userId
              return (
                <div key={m.id} style={{ textAlign: mine ? 'right' : 'left', marginBottom: 8 }}>
                  <span style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 12,
                    background: mine ? '#2F4A3D' : '#e7e2d6', color: mine ? 'white' : '#22302a',
                    maxWidth: '80%' }}>
                    {m.body}
                  </span>
                  <div style={{ fontSize: 11, color: '#999' }}>{mine ? 'You' : 'Barn staff'}</div>
                </div>
              )
            })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message about your horse..."
          style={{ flex: 1, padding: 10 }} />
        <button type="submit" disabled={sending}
          style={{ padding: '10px 16px', background: '#2F4A3D', color: 'white', border: 'none', borderRadius: 4 }}>
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}