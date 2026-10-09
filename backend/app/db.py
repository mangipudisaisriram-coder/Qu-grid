"""Tiny SQLite persistence (users, per-user system, runs)."""
import json, os, sqlite3, threading, uuid
from datetime import datetime, timezone

_PATH = os.environ.get("QUANTUMUC_DB", os.path.join(os.path.dirname(__file__), "..", "data", "quantumuc.db"))
_lock = threading.Lock()
_conn = sqlite3.connect(_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_conn.executescript("""
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, pw TEXT);
CREATE TABLE IF NOT EXISTS systems(user_id INTEGER PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, user_id INTEGER, status TEXT, progress REAL, message TEXT,
                                config TEXT, result TEXT, error TEXT, created TEXT);
""")


def q(sql, args=(), one=False, commit=False):
    with _lock:
        cur = _conn.execute(sql, args)
        if commit:
            _conn.commit()
        rows = cur.fetchall()
    return (rows[0] if rows else None) if one else rows


def create_user(email, name, pw_hash):
    q("INSERT INTO users(email,name,pw) VALUES(?,?,?)", (email.lower(), name, pw_hash), commit=True)
    return q("SELECT * FROM users WHERE email=?", (email.lower(),), one=True)


def user_by_email(email):
    return q("SELECT * FROM users WHERE email=?", (email.lower(),), one=True)


def user_by_id(uid):
    return q("SELECT * FROM users WHERE id=?", (uid,), one=True)


def get_system(uid):
    r = q("SELECT data FROM systems WHERE user_id=?", (uid,), one=True)
    return json.loads(r["data"]) if r else None


def put_system(uid, data):
    q("INSERT INTO systems(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data",
      (uid, json.dumps(data)), commit=True)


def new_run(uid, config):
    rid = uuid.uuid4().hex[:12]
    q("INSERT INTO runs(id,user_id,status,progress,message,config,created) VALUES(?,?,?,?,?,?,?)",
      (rid, uid, "queued", 0.0, "Queued", json.dumps(config), datetime.now(timezone.utc).isoformat()), commit=True)
    return rid


def update_run(rid, **kw):
    cols = ", ".join(f"{k}=?" for k in kw)
    q(f"UPDATE runs SET {cols} WHERE id=?", (*kw.values(), rid), commit=True)


def get_run(rid, uid):
    return q("SELECT * FROM runs WHERE id=? AND user_id=?", (rid, uid), one=True)


def list_runs(uid):
    return q("SELECT id,status,progress,created,config FROM runs WHERE user_id=? ORDER BY created DESC LIMIT 30", (uid,))
