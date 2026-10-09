"""One-command Qiskit check.   From backend/:   python scripts/check_qiskit.py
Prints a short report - copy/paste the whole output back to get it reviewed."""
import os, sys, platform, traceback
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from uc.models import default_system
from uc.classical import solve_milp
from uc.qaoa import run_qaoa, window_diagonal
from uc import qiskit_bridge as qkb

print("python", platform.python_version(), "| numpy", np.__version__, "| qiskit", qkb.qiskit_version())
if not qkb.qiskit_available():
    sys.exit("RESULT: FAIL - qiskit is not installed in this environment (pip install qiskit)")

S = default_system()
base = np.asarray(solve_milp(S)["u"], dtype=int)
ok = True
for W, p in [(1, 1), (2, 1), (3, 2)]:                        # 5, 10 and 15 qubits
    try:
        r = run_qaoa(S, base, t0=10, W=W, p=p, shots=1024, restarts=1, maxiter=30)
        q = r["qiskit"]
        if q.get("error") or not q.get("available"):
            ok = False; print(f"[{5*W:>2} qubits, p={p}] FAIL ->", q.get("error") or q.get("reason")); continue
        cv, t = q["cross_validation"], q["transpiled"]
        good = cv["passed"] and abs(q["expected_cost"] - r["expected_cost"]) < 1e-6 * max(1, abs(r["expected_cost"]))
        ok &= bool(good)
        print(f"[{5*W:>2} qubits, p={p}] {'PASS' if good else 'FAIL'}  fidelity={cv['fidelity']:.12f}  TVD={cv['total_variation_distance']:.2e}  "
              f"terms={q['pauli_terms']}  depth={t['depth']}  CX={t['two_qubit_gates']}  groundP={q['ground_state_probability']:.3f}  ({q['time_s']}s)")
    except Exception:
        ok = False; print(f"[{5*W:>2} qubits, p={p}] CRASH"); traceback.print_exc()

try:                                                           # Qiskit-driven training, small + fast
    r = run_qaoa(S, base, t0=10, W=1, p=1, shots=256, restarts=1, maxiter=15, engine="qiskit", qiskit_budget_s=60)
    print(f"[qiskit training] engine={r['engine']} evals={r['circuit_evaluations']} note={r['engine_note']}")
    ok &= r["engine"] == "qiskit"
except Exception:
    ok = False; print("[qiskit training] CRASH"); traceback.print_exc()
print("RESULT:", "ALL PASS" if ok else "SOMETHING FAILED - paste this output back")
