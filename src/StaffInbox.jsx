import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

export default function StaffInbox({ userId }) {
  const [threads, setThreads] = useState([])       // one entry per boarder
  const [activeBoarder, setActiveBoarder] = useState(null)

  // Load the list of boarders who have messages
  useEffect(() => {
    async function loadThreads() {
      const { data } = await supabase
        .from('messages')
        .select('boarder_id, boarder:profiles!messages_boarder_id_fkey(full_name, email)')
        .order('created_at', { ascending: false })

      // Reduce to unique boarders (most recent first)
      const seen = new Map()
      for (const m of data ?? []) {
        if (!seen.has(m.boarder_id)) {
          seen.set(m.boarder_id, {
            boarder_id: m.boarder_id,
            name: m.boarder?.full_name || m.boarder?.email || 'Boarder',
          })
        }
      }
      setThreads([...seen.values()])
    }
    loadThreads()
  }, [])

  return (
    <div>
      <h3>Barn inbox</h3>
      <div className="inbox-panel">
        {/* Left: list of conversations */}
        <div className="inbox-list">
          {threads.length === 0
            ? <p className="inbox-empty">No conversations yet.</p>
            : threads.map((t) => (
                <button key={t.boarder_id} onClick={() => setActiveBoarder(t)}
                  className={`inbox-thread-btn ${activeBoarder?.boarder_id === t.boarder_id ? 'inbox-thread-btn--active' : ''}`}>
                  {t.name}
                </button>
              ))}
        </div>

        {/* Right: the selected conversation */}
        <div className="inbox-conversation">
          {activeBoarder
            ? <Conversation boarder={activeBoarder} staffId={userId} />
            : <p className="text-muted">Select a conversation to view and reply.</p>}
        </div>
      </div>
    </div>
  )
}

function Conversation({ boarder, staffId }) {
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    supabase.from('messages').select('*').eq('boarder_id', boarder.boarder_id).order('created_at')
      .then(({ data }) => setMessages(data ?? []))

    const channel = supabase
      .channel('staff-thread-' + boarder.boarder_id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `boarder_id=eq.${boarder.boarder_id}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [boarder.boarder_id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function reply(e) {
    e.preventDefault()
    if (!body.trim()) return
    const { error } = await supabase.from('messages').insert({
      boarder_id: boarder.boarder_id,   // stays the boarder's thread
      sender_id: staffId,               // but sent by staff
      body: body.trim(),
    })
    if (error) { alert('Reply failed: ' + error.message); return }
    setBody('')
  }

  return (
    <div className="conversation">
      <div className="conversation-messages">
        {messages.map((m) => {
          const fromStaff = m.sender_id !== boarder.boarder_id
          return (
            <div key={m.id} className={`chat-row ${fromStaff ? 'chat-row--mine' : ''}`}>
              <span className={`chat-bubble ${fromStaff ? 'chat-bubble--mine' : ''}`}>
                {m.body}
              </span>
              <div className="chat-meta">{fromStaff ? 'Barn' : boarder.name}</div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={reply} className="chat-form">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply..." className="chat-input" />
        <button type="submit" className="btn">
          Send
        </button>
      </form>
    </div>
  )
}