"""Pre-compute the demo run used by the UI when no backend is reachable (writes JSON for both backend and frontend)."""
import json, os, sys
ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)
from uc.models import default_system
from uc.pipeline import run_pipeline

res = run_pipeline(default_system(), {"solver": "qaoa", "robustness": True}, progress=lambda f, m: print(f"{f:4.0%} {m}"))
for dest in (os.path.join(ROOT, "data", "demo_run.json"), os.path.join(ROOT, "..", "frontend", "src", "data", "demoRun.json")):
    with open(dest, "w") as f:
        json.dump(res, f, separators=(",", ":"))
    print("wrote", os.path.abspath(dest), f"{os.path.getsize(dest)/1024:.0f} KB")
print(json.dumps(res["summary"], indent=1))
