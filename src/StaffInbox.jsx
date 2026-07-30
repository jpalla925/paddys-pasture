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
      <h3 style={{ color: '#2F4A3D' }}>Barn inbox</h3>
      <div style={{ display: 'flex', gap: 16, border: '1px solid #d8d2c4', borderRadius: 8, overflow: 'hidden', height: 400 }}>
        {/* Left: list of conversations */}
        <div style={{ width: 200, borderRight: '1px solid #d8d2c4', overflowY: 'auto', background: '#fbf9f5' }}>
          {threads.length === 0
            ? <p style={{ padding: 12, color: '#777', fontSize: 13 }}>No conversations yet.</p>
            : threads.map((t) => (
                <button key={t.boarder_id} onClick={() => setActiveBoarder(t)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, border: 'none',
                    borderBottom: '1px solid #eee', cursor: 'pointer',
                    background: activeBoarder?.boarder_id === t.boarder_id ? '#e7e2d6' : 'transparent' }}>
                  {t.name}
                </button>
              ))}
        </div>

        {/* Right: the selected conversation */}
        <div style={{ flex: 1, padding: 12 }}>
          {activeBoarder
            ? <Conversation boarder={activeBoarder} staffId={userId} />
            : <p style={{ color: '#777' }}>Select a conversation to view and reply.</p>}
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
        {messages.map((m) => {
          const fromStaff = m.sender_id !== boarder.boarder_id
          return (
            <div key={m.id} style={{ textAlign: fromStaff ? 'right' : 'left', marginBottom: 8 }}>
              <span style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 12,
                background: fromStaff ? '#2F4A3D' : '#e7e2d6', color: fromStaff ? 'white' : '#22302a', maxWidth: '80%' }}>
                {m.body}
              </span>
              <div style={{ fontSize: 11, color: '#999' }}>{fromStaff ? 'Barn' : boarder.name}</div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={reply} style={{ display: 'flex', gap: 8 }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply..." style={{ flex: 1, padding: 10 }} />
        <button type="submit" style={{ padding: '10px 16px', background: '#2F4A3D', color: 'white', border: 'none', borderRadius: 4 }}>
          Send
        </button>
      </form>
    </div>
  )
}