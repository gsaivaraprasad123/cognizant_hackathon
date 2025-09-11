import { useState } from 'react'
import './App.css'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastAnswer, setLastAnswer] = useState<{ answer: string; sources: string[] } | null>(null)
  const [feedback, setFeedback] = useState('')
  const [correction, setCorrection] = useState('')

  const sendQuestion = async () => {
    const question = input.trim()
    if (!question) return
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const data = await res.json()
      const answer = data.answer as string
      const sources = (data.sources || []) as string[]
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, sources }])
      setLastAnswer({ answer, sources })
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error contacting backend.' }])
    } finally {
      setLoading(false)
    }
  }

  const sendFeedback = async () => {
    if (!lastAnswer) return
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '',
          answer: lastAnswer.answer,
          feedback,
          correction: correction || null,
        }),
      })
      setFeedback('')
      setCorrection('')
      alert('Feedback sent!')
    } catch (e) {
      alert('Failed to send feedback')
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <h2>Technician Chatbot</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8 }}
          value={input}
          placeholder="Ask a technician question..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendQuestion() }}
        />
        <button onClick={sendQuestion} disabled={loading}>Ask</button>
      </div>

      <div style={{ marginTop: 16, border: '1px solid #ddd', borderRadius: 8, padding: 12, minHeight: 200 }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{ marginBottom: 12 }}>
            <strong>{m.role === 'user' ? 'You' : 'Assistant'}:</strong>
            <div>{m.content}</div>
            {m.sources && m.sources.length > 0 && (
              <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                Sources: {m.sources.join(' | ')}
              </div>
            )}
          </div>
        ))}
        {loading && <div>Thinking...</div>}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <textarea
          placeholder="Feedback (e.g., helpful, not helpful, missing steps)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          style={{ padding: 8 }}
        />
        <input
          placeholder="Correction (optional): Provide the right answer or step"
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          style={{ padding: 8 }}
        />
        <button onClick={sendFeedback} disabled={!lastAnswer}>Send Feedback</button>
      </div>
    </div>
  )
}

export default App
