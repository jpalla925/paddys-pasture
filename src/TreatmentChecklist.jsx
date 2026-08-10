import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const TASKS = ['Fed AM', 'Fed PM', 'Turnout', 'Water', 'Medications']

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function TreatmentChecklist({ userId }) {
  const [horses, setHorses] = useState([])
  const [logs, setLogs] = useState([])
  const [notified, setNotified] = useState([])   // NEW: today's notified horse_ids
  const [sending, setSending] = useState(null)    // NEW: which horse is mid-send
  const [loading, setLoading] = useState(true)
  const date = today()

  async function load() {
    setLoading(true)
    const [{ data: horseData }, { data: logData }, { data: notifiedData }] = await Promise.all([
      supabase.from('horses').select('id, name, owner:profiles(full_name, email)').order('name'),
      supabase.from('treatment_log').select('*').eq('log_date', date),
      supabase.from('treatment_notified').select('horse_id').eq('notify_date', date),   // NEW
    ])
    setHorses(horseData ?? [])
    setLogs(logData ?? [])
    setNotified((notifiedData ?? []).map((n) => n.horse_id))   // NEW
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function statusFor(horseId, task) {
    return logs.find((l) => l.horse_id === horseId && l.task === task)?.status
  }

  async function toggle(horseId, task) {
    const existing = logs.find((l) => l.horse_id === horseId && l.task === task)
    if (!existing) {
      const { data, error } = await supabase.from('treatment_log')
        .insert({ horse_id: horseId, task, log_date: date, status: 'done', marked_by: userId })
        .select().single()
      if (!error && data) setLogs((prev) => [...prev, data])
    } else if (existing.status === 'done') {
      const { data, error } = await supabase.from('treatment_log')
        .update({ status: 'na', marked_by: userId }).eq('id', existing.id)
        .select().single()
      if (!error && data) setLogs((prev) => prev.map((l) => l.id === existing.id ? data : l))
    } else {
      const { error } = await supabase.from('treatment_log').delete().eq('id', existing.id)
      if (!error) setLogs((prev) => prev.filter((l) => l.id !== existing.id))
    }
  }

  function isHorseComplete(horseId) {
    return TASKS.every((task) => {
      const s = statusFor(horseId, task)
      return s === 'done' || s === 'na'
    })
  }

  // NEW: send the "cared for today" email to a horse's owner
  async function notifyOwner(horse) {
    if (!horse.owner?.email) {
      alert(`${horse.name} has no owner email on file.`)
      return
    }
    setSending(horse.id)
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        to: horse.owner.email,
        subject: `${horse.name} has been cared for today`,
        html: `
          <div style="font-family: sans-serif; color: #22302a;">
            <h2 style="color: #2F4A3D;">🐴 ${horse.name} has been cared for today</h2>
            <p>Hi ${horse.owner.full_name || 'there'},</p>
            <p>This is a note from Paddy's Pastures to let you know that ${horse.name}'s
            daily care has been completed for ${new Date(date).toLocaleDateString()}.</p>
            <p>Thank you!</p>
          </div>
        `,
      },
    })

    if (error) {
      alert('Failed to send: ' + error.message)
      setSending(null)
      return
    }

    // Record that we notified, so the button stays "Sent" today
    await supabase.from('treatment_notified')
      .insert({ horse_id: horse.id, notify_date: date, notified_by: userId })
    setNotified((prev) => [...prev, horse.id])
    setSending(null)
  }

  if (loading) return <p>Loading today's checklist...</p>

  return (
    <div className="card">
      <h3>Daily treatment checklist</h3>
      <p className="text-muted">
        {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {' '}· Tap a task to cycle: blank → ✓ done → N/A → blank
      </p>

      {horses.length === 0 ? (
        <p className="text-muted">No horses to show.</p>
      ) : (
        <div className="checklist-scroll">
          <table className="checklist-table">
            <thead>
              <tr>
                <th className="checklist-horse-col">Horse</th>
                {TASKS.map((t) => <th key={t}>{t}</th>)}
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {horses.map((horse) => {
                const complete = isHorseComplete(horse.id)
                const alreadySent = notified.includes(horse.id)
                return (
                  <tr key={horse.id} className={complete ? 'row-complete' : ''}>
                    <td className="checklist-horse-col"><strong>{horse.name}</strong></td>
                    {TASKS.map((task) => {
                      const status = statusFor(horse.id, task)
                      return (
                        <td key={task}>
                          <button
                            className={`task-cell task-${status || 'unset'}`}
                            onClick={() => toggle(horse.id, task)}
                            title={status || 'not done'}>
                            {status === 'done' ? '✓' : status === 'na' ? 'N/A' : '–'}
                          </button>
                        </td>
                      )
                    })}
                    <td className="checklist-owner-col">
                      {alreadySent ? (
                        <span className="text-muted checklist-sent">✓ Sent</span>
                      ) : (
                        <button
                          className="btn btn-secondary btn-small"
                          disabled={!complete || sending === horse.id}
                          onClick={() => notifyOwner(horse)}
                          title={complete ? 'Email the owner' : 'Complete all tasks first'}>
                          {sending === horse.id ? 'Sending...' : 'Notify owner'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}