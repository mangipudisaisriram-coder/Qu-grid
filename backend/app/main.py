"""QuantumUC API.  Run:  uvicorn app.main:app --reload --port 8000   (from backend/)"""
import csv, io, json, os, re, sqlite3, sys, threading
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app import auth, db
from uc.models import System, default_system
from uc.pipeline import run_pipeline

app = FastAPI(title="QuantumUC API", version="1.0.0",
              description="Quantum-assisted unit commitment & load balancing (simulated; no quantum hardware).")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
DEMO = os.path.join(os.path.dirname(__file__), "..", "data", "demo_run.json")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Register(BaseModel):
    email: str
    password: str
    name: str = "Student"


class Login(BaseModel):
    email: str
    password: str


class RunIn(BaseModel):
    config: dict = {}
    system: Optional[dict] = None


def me(authorization: str = Header(default="")):
    uid = auth.read_token(authorization.removeprefix("Bearer ").strip()) if authorization else None
    user = db.user_by_id(uid) if uid else None
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def _user_out(u):
    return {"id": u["id"], "email": u["email"], "name": u["name"]}


@app.get("/api/health")
def health():
    return {"status": "ok", "quantum_hardware": False}


@app.post("/api/auth/register")
def register(b: Register):
    if not EMAIL.match(b.email) or len(b.password) < 8:
        raise HTTPException(422, "Valid email and a password of at least 8 characters are required")
    try:
        u = db.create_user(b.email, b.name.strip() or "Student", auth.hash_password(b.password))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists")
    return {"token": auth.make_token(u["id"]), "user": _user_out(u)}


@app.post("/api/auth/login")
def login(b: Login):
    u = db.user_by_email(b.email)
    if not u or not auth.verify_password(b.password, u["pw"]):
        raise HTTPException(401, "Invalid email or password")
    return {"token": auth.make_token(u["id"]), "user": _user_out(u)}


@app.post("/api/auth/google")
def google():
    raise HTTPException(501, "Google sign-in is not configured. Add an OAuth client (GOOGLE_CLIENT_ID) and verify the ID token here.")


@app.get("/api/auth/me")
def whoami(u=Depends(me)):
    return _user_out(u)


@app.get("/api/system")
def get_system(u=Depends(me)):
    return db.get_system(u["id"]) or default_system().to_dict()


@app.put("/api/system")
def put_system(body: dict, u=Depends(me)):
    try:
        System.from_dict(body).validate()
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(422, f"Invalid system: {e}")
    db.put_system(u["id"], body)
    return body


def _worker(rid, system, config):
    try:
        db.update_run(rid, status="running")
        res = run_pipeline(system, config, progress=lambda f, m: db.update_run(rid, progress=f, message=m))
        db.update_run(rid, status="done", progress=1.0, message="Done", result=json.dumps(res))
    except Exception as e:  # noqa: BLE001
        db.update_run(rid, status="error", error=str(e), message="Failed")


@app.post("/api/runs")
def start_run(b: RunIn, u=Depends(me)):
    data = b.system or db.get_system(u["id"]) or default_system().to_dict()
    try:
        system = System.from_dict(data)
        system.validate()
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(422, f"Invalid system: {e}")
    rid = db.new_run(u["id"], b.config)
    threading.Thread(target=_worker, args=(rid, system, b.config), daemon=True).start()
    return {"id": rid, "status": "queued"}


@app.get("/api/runs")
def runs(u=Depends(me)):
    return [{"id": r["id"], "status": r["status"], "progress": r["progress"], "created": r["created"]} for r in db.list_runs(u["id"])]


@app.get("/api/runs/{rid}")
def run(rid: str, u=Depends(me)):
    r = db.get_run(rid, u["id"])
    if not r:
        raise HTTPException(404, "Run not found")
    return {"id": r["id"], "status": r["status"], "progress": r["progress"], "message": r["message"], "error": r["error"],
            "result": json.loads(r["result"]) if r["result"] else None}


@app.get("/api/runs/{rid}/export", response_class=PlainTextResponse)
def export(rid: str, solver: str = "quantum", u=Depends(me)):
    r = db.get_run(rid, u["id"])
    if not r or not r["result"]:
        raise HTTPException(404, "Run not found or not finished")
    res = json.loads(r["result"])
    sched = res["classical"]["schedule"] if solver == "classical" else res[res["best_quantum"]]["schedule"]
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["hour", "demand_MW", *[f"{g['id']}_on" for g in res["system"]["generators"]], *[f"{g['id']}_MW" for g in res["system"]["generators"]]])
    for t, d in enumerate(res["system"]["demand"]):
        w.writerow([t, d, *[row[t] for row in sched["u"]], *[row[t] for row in sched["P"]]])
    return out.getvalue()


@app.get("/api/demo")
def demo():
    if not os.path.exists(DEMO):
        raise HTTPException(404, "Run `python scripts/make_demo.py` first")
    with open(DEMO) as f:
        return json.load(f)
