"""
chat_api.py — FastAPI REST server for managing chat threads & message history.
Stores everything in SQLite (chat_history.db in the project root).
Run with: uvicorn chat_api:app --port 8001 --reload
"""

import sqlite3
import uuid
import time
import os
import logging
from typing import Optional, Literal
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("chat-api")

# ── DB path ───────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "chat_history.db")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Velo Chat History API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB helpers ────────────────────────────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS threads (
                id          TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id          TEXT PRIMARY KEY,
                thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
                role        TEXT NOT NULL CHECK(role IN ('user', 'agent')),
                source      TEXT NOT NULL CHECK(source IN ('chat', 'voice')),
                text        TEXT NOT NULL,
                timestamp   INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, timestamp);
        """)
    logger.info("Database initialised at %s", DB_PATH)


# ── Pydantic models ───────────────────────────────────────────────────────────

class ThreadCreate(BaseModel):
    title: str = "New Chat"

class ThreadRename(BaseModel):
    title: str

class MessageCreate(BaseModel):
    role: Literal["user", "agent"]
    source: Literal["chat", "voice"]
    text: str
    id: Optional[str] = None
    timestamp: Optional[int] = None


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()


# ── Threads endpoints ─────────────────────────────────────────────────────────

@app.get("/threads")
def list_threads():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/threads", status_code=201)
def create_thread(body: ThreadCreate):
    now = int(time.time() * 1000)
    tid = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?,?,?,?)",
            (tid, body.title, now, now),
        )
    return {"id": tid, "title": body.title, "created_at": now, "updated_at": now}


@app.patch("/threads/{thread_id}")
def rename_thread(thread_id: str, body: ThreadRename):
    now = int(time.time() * 1000)
    with get_db() as conn:
        rows = conn.execute(
            "UPDATE threads SET title=?, updated_at=? WHERE id=?",
            (body.title, now, thread_id),
        ).rowcount
    if rows == 0:
        raise HTTPException(404, "Thread not found")
    return {"id": thread_id, "title": body.title, "updated_at": now}


@app.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: str):
    with get_db() as conn:
        conn.execute("DELETE FROM messages WHERE thread_id=?", (thread_id,))
        conn.execute("DELETE FROM threads WHERE id=?", (thread_id,))
    return None


# ── Messages endpoints ────────────────────────────────────────────────────────

@app.get("/threads/{thread_id}/messages")
def list_messages(thread_id: str):
    with get_db() as conn:
        thread = conn.execute(
            "SELECT id FROM threads WHERE id=?", (thread_id,)
        ).fetchone()
        if not thread:
            raise HTTPException(404, "Thread not found")
        rows = conn.execute(
            "SELECT id, thread_id, role, source, text, timestamp "
            "FROM messages WHERE thread_id=? ORDER BY timestamp ASC",
            (thread_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/threads/{thread_id}/messages", status_code=201)
def add_message(thread_id: str, body: MessageCreate):
    now = body.timestamp or int(time.time() * 1000)
    mid = body.id or str(uuid.uuid4())
    with get_db() as conn:
        thread = conn.execute(
            "SELECT id FROM threads WHERE id=?", (thread_id,)
        ).fetchone()
        if not thread:
            raise HTTPException(404, "Thread not found")
        conn.execute(
            "INSERT OR IGNORE INTO messages (id, thread_id, role, source, text, timestamp) "
            "VALUES (?,?,?,?,?,?)",
            (mid, thread_id, body.role, body.source, body.text, now),
        )
        # bump thread updated_at
        conn.execute(
            "UPDATE threads SET updated_at=? WHERE id=?", (now, thread_id)
        )
    return {"id": mid, "thread_id": thread_id, "role": body.role, "source": body.source,
            "text": body.text, "timestamp": now}


@app.delete("/threads/{thread_id}/messages/{message_id}", status_code=204)
def delete_message(thread_id: str, message_id: str):
    with get_db() as conn:
        conn.execute(
            "DELETE FROM messages WHERE id=? AND thread_id=?", (message_id, thread_id)
        )
    return None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("chat_api:app", host="0.0.0.0", port=8001, reload=True)
