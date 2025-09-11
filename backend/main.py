from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
import google.generativeai as genai

# Environment configuration
# Allow override via env; default to the provided key for quick demo
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDXrwV7F-mi1tThNS9b1bVnYhdDOuaoy9E")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Choose a lightweight, fast model for demo
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

app = FastAPI(title="Technician Chatbot API")

# CORS configuration (allow local dev frontends)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load embedding model
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# Prepare FAISS index
EMBED_DIM = 384  # all-MiniLM-L6-v2
index = faiss.IndexFlatL2(EMBED_DIM)

# In-memory stores
documents: list[str] = []

# Paths
BASE_DIR = os.path.dirname(__file__)
KB_PATH = os.path.join(BASE_DIR, "kb", "manual.txt")
FEEDBACK_PATH = os.path.join(BASE_DIR, "feedback.json")

# Load sample manual and build index
if os.path.exists(KB_PATH):
    with open(KB_PATH, "r") as f:
        docs = [line.strip() for line in f.readlines() if line.strip()]
        documents.extend(docs)
        if docs:
            vectors = embedder.encode(docs, convert_to_numpy=True, normalize_embeddings=False)
            vectors = vectors.astype("float32")
            index.add(vectors)
else:
    # Ensure folder exists for clarity
    os.makedirs(os.path.dirname(KB_PATH), exist_ok=True)

class Query(BaseModel):
    question: str

class Feedback(BaseModel):
    question: str
    answer: str
    feedback: str
    correction: str | None = None

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/ask")
def ask(query: Query):
    if not documents:
        return {"answer": "Knowledge base is empty.", "sources": []}

    q_embed = embedder.encode([query.question], convert_to_numpy=True)
    q_embed = q_embed.astype("float32")
    D, I = index.search(q_embed, k=min(3, len(documents)))
    retrieved_docs = [documents[i] for i in I[0] if i >= 0 and i < len(documents)]

    # Build prompt for the LLM
    prompt = (
        "You are a helpful automotive technician assistant. "
        "Use only the provided relevant info. If unsure, say you are unsure.\n\n"
        f"Question: {query.question}\n"
        f"Relevant Info: {json.dumps(retrieved_docs)}\n\n"
        "Provide a clear, step-by-step answer with safety notes if applicable."
    )

    if not GEMINI_API_KEY:
        # Fallback for demo without API key
        return {
            "answer": "[Demo mode] Key points from docs: " + " | ".join(retrieved_docs),
            "sources": retrieved_docs,
        }

    model = genai.GenerativeModel(GEMINI_MODEL_NAME)
    result = model.generate_content(prompt)
    answer = (getattr(result, "text", None) or "").strip() or "No answer generated."
    return {"answer": answer, "sources": retrieved_docs}

@app.post("/feedback")
def feedback(data: Feedback):
    if os.path.exists(FEEDBACK_PATH):
        try:
            with open(FEEDBACK_PATH, "r") as f:
                feedback_data = json.load(f)
                if not isinstance(feedback_data, list):
                    feedback_data = []
        except Exception:
            feedback_data = []
    else:
        feedback_data = []

    feedback_data.append(data.dict())
    with open(FEEDBACK_PATH, "w") as f:
        json.dump(feedback_data, f, indent=2)

    return {"message": "Feedback saved!"}

@app.post("/reindex")
def reindex_from_feedback():
    """Load corrections from feedback.json into the in-memory KB and FAISS index."""
    if not os.path.exists(FEEDBACK_PATH):
        return {"added": 0, "message": "No feedback file found."}

    try:
        with open(FEEDBACK_PATH, "r") as f:
            feedback_items = json.load(f)
            if not isinstance(feedback_items, list):
                feedback_items = []
    except Exception:
        return {"added": 0, "message": "Failed to read feedback file."}

    # Extract non-empty corrections
    new_texts: list[str] = []
    for item in feedback_items:
        correction = (item or {}).get("correction")
        if isinstance(correction, str):
            correction = correction.strip()
            if correction:
                new_texts.append(correction)

    if not new_texts:
        return {"added": 0, "message": "No corrections to add."}

    # Update memory and FAISS
    documents.extend(new_texts)
    vectors = embedder.encode(new_texts, convert_to_numpy=True, normalize_embeddings=False)
    vectors = vectors.astype("float32")
    index.add(vectors)

    return {"added": len(new_texts), "message": "Corrections added to index."}
