import json
import os
import sqlite3
from pathlib import Path
from typing import Dict, List

class MemoryEngine:
    def __init__(self):
        self.db_path = os.getenv(
            "VED_DB_PATH",
            str(Path(__file__).resolve().parent.parent / "ved_memory.db")
        )
        self.fallback_db_path = os.getenv("VED_FALLBACK_DB_PATH", r"C:\tmp\ved_memory.db")
        self.sessions: Dict[str, List[dict]] = {}

    def init_db(self):
        try:
            conn = self._connect()
            self._create_schema(conn)
        except sqlite3.OperationalError as err:
            if "disk I/O error" not in str(err):
                raise
            self.db_path = self.fallback_db_path
            conn = self._connect()
            self._create_schema(conn)

        print(f"[-] SQLite Memory Initialized at {self.db_path}")

    def _create_schema(self, conn):
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS long_term_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        c.execute('''
            CREATE TABLE IF NOT EXISTS personal_data (
                user_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()

    def create_session(self, sid: str):
        self.sessions[sid] = []

    def clear_session(self, sid: str):
        if sid in self.sessions:
            del self.sessions[sid]

    def add_short_term(self, sid: str, role: str, content: str):
        if sid not in self.sessions:
            self.sessions[sid] = []
        self.sessions[sid].append({"role": role, "content": content})
        # Keep last 20 messages for context
        if len(self.sessions[sid]) > 20:
            self.sessions[sid].pop(0)

    def get_short_term(self, sid: str) -> List[dict]:
        return self.sessions.get(sid, [])
        
    def save_long_term(self, topic: str, content: str):
        conn = self._connect()
        c = conn.cursor()
        c.execute("INSERT INTO long_term_memory (topic, content) VALUES (?, ?)", (topic, content))
        conn.commit()
        conn.close()
        
    def fetch_long_term(self) -> str:
        conn = self._connect()
        c = conn.cursor()
        c.execute("SELECT content FROM long_term_memory ORDER BY created_at DESC LIMIT 10")
        rows = c.fetchall()
        conn.close()
        return "\n".join([r[0] for r in rows])

    def load_personal_data(self, user_id: str) -> dict:
        if not user_id:
            return self._empty_personal_data()

        conn = self._connect()
        c = conn.cursor()
        c.execute("SELECT payload FROM personal_data WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        conn.close()

        if not row:
            return self._empty_personal_data()

        try:
            data = json.loads(row[0])
            return self._normalize_personal_data(data)
        except json.JSONDecodeError:
            return self._empty_personal_data()

    def save_personal_data(self, user_id: str, payload: dict) -> dict:
        if not user_id:
            return self._normalize_personal_data(payload)

        data = self._normalize_personal_data(payload)
        conn = self._connect()
        c = conn.cursor()
        c.execute(
            """
            INSERT INTO personal_data (user_id, payload, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, json.dumps(data))
        )
        conn.commit()
        conn.close()
        return data

    def clear_personal_data(self, user_id: str) -> dict:
        empty = self._empty_personal_data()
        if not user_id:
            return empty

        conn = self._connect()
        c = conn.cursor()
        c.execute("DELETE FROM personal_data WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        return empty

    def _empty_personal_data(self) -> dict:
        return {"memories": [], "notes": [], "reminders": []}

    def _normalize_personal_data(self, payload: dict) -> dict:
        payload = payload if isinstance(payload, dict) else {}
        normalized = {}
        for key, limit in (("memories", 30), ("notes", 50), ("reminders", 50)):
            items = payload.get(key, [])
            normalized[key] = items[:limit] if isinstance(items, list) else []
        return normalized

    def _connect(self):
        db_file = Path(self.db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(self.db_path)
