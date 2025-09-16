import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import "./App.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<{
    answer: string;
    sources: string[];
  } | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");

  // Add recall and precision to metrics
  const [metrics, setMetrics] = useState<{
    total: number;
    correct: number;
    incorrect: number;
    accuracy: number;
    recall?: number;
    precision?: number;
  } | null>(null);

  const accuracyPct = useMemo(
    () => (metrics ? Math.round(metrics.accuracy * 100) : 0),
    [metrics]
  );
  const recallPct = useMemo(
    () =>
      metrics && metrics.recall !== undefined
        ? Math.round(metrics.recall * 100)
        : null,
    [metrics]
  );
  const precisionPct = useMemo(
    () =>
      metrics && metrics.precision !== undefined
        ? Math.round(metrics.precision * 100)
        : null,
    [metrics]
  );

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${API_BASE}/metrics`);
      const data = await res.json();
      setMetrics(data);
    } catch {}
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const sendQuestion = async () => {
    const question = input.trim();
    if (!question) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const answer = data.answer as string;
      const sources = (data.sources || []) as string[];
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, sources },
      ]);
      setLastAnswer({ answer, sources });
      setShowCorrection(false);
      setCorrection("");
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error contacting backend." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (isCorrect: boolean) => {
    if (!lastAnswer) return;
    try {
      const latestQuestion =
        messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
      await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: latestQuestion,
          answer: lastAnswer.answer,
          feedback: isCorrect ? "correct" : "incorrect",
          correction: isCorrect ? null : correction || null,
        }),
      });
      setShowCorrection(false);
      setCorrection("");
      fetchMetrics();
    } catch (e) {}
  };

  return (
    <div>
      <div className="header">
        <div
          className="container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="/Chatbot%20Chat%20Message.jpg"
              alt="Technician Chatbot Logo"
              style={{
                height: 32,
                width: 32,
                borderRadius: 8,
                objectFit: "cover",
                background: "#fff",
              }}
            />
            <span style={{ fontWeight: 700 }}>Technician Chatbot</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Accuracy</span>
              <span className="badge">{metrics ? `${accuracyPct}%` : "—"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Recall</span>
              <span className="badge">
                {recallPct !== null ? `${recallPct}%` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>Precision</span>
              <span className="badge">
                {precisionPct !== null ? `${precisionPct}%` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 24 }}>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h1 style={{ margin: "0 0 6px 0" }}>Your AI Technician Assistant</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Ask troubleshooting questions across Engine, Electrical, and HVAC.
            We ground answers in your knowledge base and learn from your
            feedback.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          <div className="card" style={{ overflow: "hidden" }}>
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              Chat
            </div>
            <div className="chat">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`msg ${m.role === "user" ? "right" : ""}`}
                >
                  <div
                    className={`bubble ${
                      m.role === "user" ? "user" : "assistant"
                    }`}
                  >
                    <ReactMarkdown
                      children={m.content}
                      components={{
                        p: ({ node, ...props }) => (
                          <p style={{ margin: "0 0 8px 0" }} {...props} />
                        ),
                        strong: ({ node, ...props }) => (
                          <strong style={{ fontWeight: 600 }} {...props} />
                        ),
                        li: ({ node, ...props }) => (
                          <li style={{ marginLeft: 16 }} {...props} />
                        ),
                      }}
                    />
                    {m.sources && m.sources.length > 0 && (
                      <div className="sources">
                        Sources: {m.sources.join(" | ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ fontSize: 14, color: "#64748b" }}>Thinking…</div>
              )}
            </div>
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #e2e8f0",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  value={input}
                  placeholder="Ask a technician question…"
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendQuestion();
                  }}
                />
                <button
                  onClick={sendQuestion}
                  disabled={loading}
                  className="button-primary"
                >
                  Ask
                </button>
              </div>
              {lastAnswer && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 10,
                  }}
                >
                  <span style={{ fontSize: 14, color: "#475569" }}>
                    Was this helpful?
                  </span>
                  <button
                    onClick={() => sendFeedback(true)}
                    className="button-soft ok"
                  >
                    Correct
                  </button>
                  <button
                    onClick={() => setShowCorrection((s) => !s)}
                    className="button-soft"
                  >
                    Incorrect
                  </button>
                </div>
              )}
              {showCorrection && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <textarea
                    className="input"
                    placeholder="Provide the correct steps or answer…"
                    value={correction}
                    onChange={(e) => setCorrection(e.target.value)}
                    rows={3}
                    style={{ height: 96 }}
                  />
                  <button
                    onClick={() => sendFeedback(false)}
                    className="button-soft"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "#94a3b8",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto", color: "#f59e42", background: "#fffbe9", border: "1px solid #fde68a", borderRadius: 8, padding: 16, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Disclaimer</div>
          <div>This chatbot is a prototype built for hackathon demonstration purposes.<br/>
          It is not a replacement for certified technician expertise.<br/>
          Responses are based on available knowledge sources and may need further validation in real-world use.<br/>
          Future versions will undergo rigorous testing and validation before deployment.</div>
        </div>
      </div>
    </div>
  );
}

export default App;
