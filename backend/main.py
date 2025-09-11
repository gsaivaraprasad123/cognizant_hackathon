from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
import google.generativeai as genai
import re

# Environment configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDXrwV7F-mi1tThNS9b1bVnYhdDOuaoy9E")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Choose a lightweight, fast model for demo
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

app = FastAPI(title="Technician Chatbot API")

# CORS configuration 
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
def _index_texts(texts: list[str]):
    if not texts:
        return
    vectors = embedder.encode(texts, convert_to_numpy=True, normalize_embeddings=False)
    vectors = vectors.astype("float32")
    index.add(vectors)

def _append_to_manual_and_index(text: str):
    text = text.strip()
    if not text:
        return False
    try:
        with open(KB_PATH, "a") as f:
            f.write("\n" + text + "\n")
    except Exception:
        return False
    documents.append(text)
    _index_texts([text])
    return True

if os.path.exists(KB_PATH):
    with open(KB_PATH, "r") as f:
        docs = [line.strip() for line in f.readlines() if line.strip()]
        documents.extend(docs)
        _index_texts(docs)
else:
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

@app.get("/metrics")
def metrics():
    total = 0
    correct = 0
    incorrect = 0
    if os.path.exists(FEEDBACK_PATH):
        try:
            with open(FEEDBACK_PATH, "r") as f:
                feedback_items = json.load(f)
                if not isinstance(feedback_items, list):
                    feedback_items = []
        except Exception:
            feedback_items = []
        for item in feedback_items:
            if not isinstance(item, dict):
                continue
            total += 1
            fb = (item.get("feedback") or "").lower()
            corr = (item.get("correction") or "").strip()
            if corr:
                incorrect += 1
            elif any(k in fb for k in ["incorrect", "not helpful", "wrong", "bad"]):
                incorrect += 1
            elif any(k in fb for k in ["correct", "helpful", "good", "useful", "accurate"]):
                correct += 1
            else:
                pass
    accuracy = (correct / total) if total > 0 else 0.0
    return {"total": total, "correct": correct, "incorrect": incorrect, "accuracy": accuracy}


def _keyword_overlap_score(question: str, doc: str) -> int:
    words = re.findall(r"[a-zA-Z0-9]+", question.lower())
    if not words:
        return 0
    score = sum(1 for w in set(words) if w in doc.lower())
    return score

@app.post("/ask")
def ask(query: Query):
    if not documents:
        return {"answer": "Knowledge base is empty.", "sources": []}

    q_embed = embedder.encode([query.question], convert_to_numpy=True)
    q_embed = q_embed.astype("float32")
    D, I = index.search(q_embed, k=min(3, len(documents)))
    retrieved_docs = [documents[i] for i in I[0] if i >= 0 and i < len(documents)]

    kb_context = " | ".join(retrieved_docs) if retrieved_docs else ""

    # Trying to generate fused answer with Gemini using KB context
    fused_answer = None
    gemini_error = None
    if GEMINI_API_KEY:
        prompt = (
            "You are a technician assistant.\n"
            "Combine the following manual notes with your own knowledge to provide a precise, safe, step-by-step solution.\n"
            "Clearly state assumptions if needed and add a brief 'How it works' if relevant.\n\n"
            f"Question: {query.question}\n"
            f"Manual notes: {kb_context if kb_context else 'N/A'}\n\n"
            "Answer (combine both sources coherently; do not contradict safety):"
        )
        try:
            model = genai.GenerativeModel(GEMINI_MODEL_NAME)
            result = model.generate_content(prompt)
            fused_answer = (getattr(result, "text", None) or "").strip()
        except Exception as e:
            gemini_error = str(e)

    # KB-only synthesis if Gemini unavailable or empty
    if not fused_answer:
        if kb_context:
            fused_answer = "Based on the manual: " + kb_context
        else:
            fused_answer = "No relevant info found in the manual and the model is unavailable."

    # Persist fused answer to manual and index for future use
    _append_to_manual_and_index(fused_answer)

    return {"answer": fused_answer, "sources": retrieved_docs if retrieved_docs else (["gemini-generated"] if GEMINI_API_KEY and not gemini_error else [])}

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
    _index_texts(new_texts)

    # Persist to manual as well for durability
    try:
        with open(KB_PATH, "a") as f:
            for t in new_texts:
                f.write("\n" + t + "\n")
    except Exception:
        pass

    return {"added": len(new_texts), "message": "Corrections added to index and manual."}
