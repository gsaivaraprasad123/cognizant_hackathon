# Technician AI Chatbot

A full-stack Retrieval-Augmented Generation (RAG) demo for a Technician Assistant. The system ingests a technician manual, retrieves relevant notes with embeddings + FAISS, fuses them with a Gemini model answer, returns a combined response, and continuously improves by storing feedback and appending new knowledge back into the manual and index.

## ✨ Features
- RAG with FAISS + `all-MiniLM-L6-v2` sentence embeddings
- Gemini LLM fusion: combine KB snippets with model output into a single coherent answer
- Auto-knowledge growth: fused answers get appended to `manual.txt` and indexed for future retrieval
- Feedback loop: collect Correct/Incorrect feedback with optional corrections
- Accuracy metrics: simple correctness ratio computed from feedback
- Minimal, responsive chat UI with a clean light theme

## 🧩 Tech Stack
- Backend: FastAPI, FAISS, Sentence Transformers, Google Gemini (`google-generativeai`)
- Frontend: Vite + React + TypeScript
- Data: Flat text manual (`backend/kb/manual.txt`) + feedback log (`backend/feedback.json`)

## 📁 Project Structure
```
technician-chatbot/
├── backend/
│   ├── main.py               # FastAPI app (RAG, Gemini fusion, feedback, metrics)
│   ├── kb/
│   │   └── manual.txt        # Knowledge base (appended as the system learns)
│   └── feedback.json         # Collected feedback log
├── frontend/                 # Vite + React app
│   ├── src/App.tsx           # Chat UI, accuracy badge, feedback controls
│   ├── src/App.css           # Light theme styling and animations
│   └── ...
└── README.md
```

## 🔐 Environment
- Backend expects the following environment variables (optional; defaults provided for quick demo):
  - `GEMINI_API_KEY` – your Gemini API key
  - `GEMINI_MODEL` – default `gemini-1.5-flash`
- Frontend (optional):
  - `VITE_API_BASE` – defaults to `http://127.0.0.1:8000`

## 🚀 Quickstart

### 1) Backend
```bash
cd technician-chatbot
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# optional (override default-in-code key)
export GEMINI_API_KEY=YOUR_KEY

uvicorn backend.main:app --reload --port 8000
```

### 2) Frontend
```bash
cd technician-chatbot/frontend
npm install
npm run dev -- --port 5173
```
Open `http://localhost:5173`.

## 🧠 How It Works
### Retrieval-Augmented Generation (RAG) flow
1. Manual is loaded from `backend/kb/manual.txt` at startup
2. Embeddings are created with `all-MiniLM-L6-v2` (384-dim) and added to FAISS
3. On `/ask`, the system:
   - Encodes the question, retrieves top KB notes via FAISS
   - Calls Gemini with the question + retrieved KB notes
   - Fuses both into one answer (with step-by-step guidance)
   - Appends the fused answer to `manual.txt` and re-indexes immediately

If Gemini is unavailable or rate-limited, the system falls back to a KB-only synthesized answer and still appends it, so the KB continues to grow.

### Feedback + Accuracy
- The UI collects `Correct` / `Incorrect` with optional `correction`
- Feedback entries are stored in `backend/feedback.json`
- `GET /metrics` returns:
  - `total`, `correct`, `incorrect`, `accuracy` (correct/total)
- `POST /reindex` ingests all `correction` texts into FAISS and appends them to the manual for durability

## 🔌 API Reference
Base URL: `http://127.0.0.1:8000`

### POST `/ask`
- Body
```json
{ "question": "Why is engine overheating?" }
```
- Response
```json
{
  "answer": "...fused KB + model answer...",
  "sources": ["...top relevant manual lines..."]
}
```

### POST `/feedback`
- Body
```json
{
  "question": "...",
  "answer": "...",
  "feedback": "correct | incorrect | ...",
  "correction": "(optional) Corrected or missing steps"
}
```
- Response
```json
{ "message": "Feedback saved!" }
```

### GET `/metrics`
- Response
```json
{ "total": 12, "correct": 8, "incorrect": 3, "accuracy": 0.6667 }
```

### POST `/reindex`
- Response
```json
{ "added": 3, "message": "Corrections added to index and manual." }
```

## 🖥️ Frontend UX
- Landing card + chat area
- Accuracy badge pulled from `/metrics`
- Input box with Enter-to-send
- Feedback controls:
  - Correct (immediately logs as correct)
  - Incorrect → opens inline correction box → submit to log and improve

## 📚 Knowledge Base
- Seeded with many cases across Engine/Automotive, Electrical Systems, HVAC, and general mechanical topics
- Every fused answer is appended to `backend/kb/manual.txt` and indexed
- You can manually edit `manual.txt`; changes will be picked up on next start
- Use `/reindex` to ingest feedback corrections without restarting

## 🧪 Example Commands
Ask a question:
```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"How does a refrigerator defrost system work?"}'
```
Send feedback:
```bash
curl -X POST http://127.0.0.1:8000/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "question":"How does a refrigerator defrost system work?",
    "answer":"...",
    "feedback":"incorrect",
    "correction":"Defrost heater cycles via timer or control board; verify continuity and frost pattern."
  }'
```
Reindex corrections:
```bash
curl -X POST http://127.0.0.1:8000/reindex
```
Metrics:
```bash
curl http://127.0.0.1:8000/metrics
```

## ⚠️ Troubleshooting
- Gemini 429 quota
  - Error: `ResourceExhausted: 429 You exceeded your current quota...`
  - Mitigation: Set a valid `GEMINI_API_KEY`, reduce request rate, or upgrade quota. The system will fall back to KB-only synthesis when the model is unavailable.
- Missing `google` module
  - Run: `pip install -r backend/requirements.txt` in your activated venv
- `faiss-cpu` version conflicts
  - This project pins a macOS Apple Silicon-compatible version. If you’re on a different platform, adjust `backend/requirements.txt` for your environment.
- CORS
  - Frontend runs on 5173, backend on 8000. CORS is configured to allow common localhost origins.

## 🔒 Notes on Safety & Data
- Generated answers are appended to the manual to grow knowledge. For production, consider:
  - Moderation, validation, and deduplication of appended content
  - Versioning of KB and change review workflows
  - Role-based access and audit trails

## 🛣️ Roadmap Ideas
- Auth and multi-tenant KBs
- Chunked document ingestion (PDFs/HTML) with better metadata and source attributions
- Distance-based relevance threshold and hybrid search (BM25 + embeddings)
- Vector store persistence (e.g., FAISS on disk) and background reindex jobs
- Fine-grained accuracy metrics (task-specific scoring, confusion matrix)


