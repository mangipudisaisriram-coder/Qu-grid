"""End-to-end hybrid pipeline: MILP baseline -> QUBO -> annealing -> QAOA window -> repair -> dispatch -> evaluate."""
from __future__ import annotations
import time
from datetime import datetime, timezone
from copy import deepcopy
import numpy as np
from .models import System
from .classical import solve_milp
from .dispatch import economic_dispatch
from .evaluate import evaluate, repair
from .qubo import build_qubo
from .annealing import anneal
from .qaoa import run_qaoa

DEFAULTS = dict(solver="qaoa", reads=48, sweeps=300, penalty=5.0, qaoa_p=2, qaoa_shots=2048, qaoa_window=3,
                seed=7, robustness=False, qaoa_engine="numpy", qiskit_verify=True)


def finalize(sys: System, u_raw):
    """repair -> economic dispatch -> evaluate.  Returns (u, P, metrics, repaired?)."""
    u_raw = np.asarray(u_raw, dtype=int)
    u = repair(sys, u_raw)
    d = economic_dispatch(sys, u)
    m = evaluate(sys, u, d["P"])
    m["ramp_relaxed"] = bool(d["ramp_relaxed"])
    return u, d["P"], m, bool((u != u_raw).any())


def _sched(u, P):
    return {"u": np.asarray(u).astype(int).tolist(), "P": np.round(np.asarray(P), 2).tolist()}


def _clean(m):
    return {k: (float(v) if isinstance(v, (np.floating, float)) else (bool(v) if isinstance(v, (bool, np.bool_)) else (int(v) if isinstance(v, (np.integer, int)) else v))) for k, v in m.items()}


def run_pipeline(sys: System, cfg: dict | None = None, progress=None) -> dict:
    cfg = {**DEFAULTS, **(cfg or {})}
    sys.validate()
    tick = progress or (lambda f, msg: None)
    t_all = time.time()
    out = {"meta": {"created": datetime.now(timezone.utc).isoformat(), "config": cfg, "is_quantum_hardware": False,
                    "quantum_backend": "NumPy statevector simulator (QAOA) / classical simulated annealing"},
           "system": sys.to_dict()}

    tick(0.05, "Solving classical MILP baseline")
    mil = solve_milp(sys)
    if not mil["success"]:
        raise RuntimeError(f"Classical MILP infeasible: {mil['status']}")
    uc, Pc, mc, _ = finalize(sys, mil["u"])
    out["classical"] = {"schedule": _sched(uc, Pc), "metrics": _clean(mc),
                        "solver": {"name": "HiGHS MILP (scipy)", "status": str(mil["status"]), "time_s": round(mil["time"], 3),
                                   "variables": mil["num_vars"], "constraints": mil["num_constraints"]}}
    c_cost = mc["cost"]

    tick(0.2, "Building QUBO")
    q = build_qubo(sys, lam=cfg["penalty"])
    tick(0.25, f"Annealing {q.n}-variable QUBO")
    t0 = time.time()
    sa = anneal(q, reads=cfg["reads"], sweeps=cfg["sweeps"], seed=cfg["seed"])
    t_sa = time.time() - t0

    tick(0.55, "Repairing and dispatching samples")
    samples, best = [], None
    for k, x in enumerate(sa["X"]):
        u, P, m, rep = finalize(sys, q.decode(x))
        samples.append({"cost": float(m["cost"]), "feasible": m["feasible"], "repaired": rep, "energy": float(sa["energies"][k])})
        if m["feasible"] and (best is None or m["cost"] < best[2]["cost"]):
            best = (u, P, m)
    if best is None:                                  # no feasible sample: keep the cheapest anyway, flagged infeasible
        u, P, m, _ = finalize(sys, q.decode(sa["X"][0]))
        best = (u, P, m)
    conv = []
    for cp in sa["trace"]:
        _, _, m, _ = finalize(sys, q.decode(cp["x"]))
        conv.append({"iteration": cp["sweep"], "cost": float(m["cost"]), "energy": cp["best_energy"],
                     "mean_energy": cp["mean_energy"], "temperature": cp["temperature"], "feasible": m["feasible"]})
    out["annealing"] = {"schedule": _sched(best[0], best[1]), "metrics": _clean(best[2]), "samples": samples, "convergence": conv,
                        "qubo": {"variables": q.n, "commitment_bits": q.n_u, "slack_bits": q.n - q.n_u, "penalty": q.lam},
                        "reads": cfg["reads"], "sweeps": cfg["sweeps"], "time_s": round(t_sa, 3),
                        "iterations": cfg["reads"] * cfg["sweeps"] * q.n}
    candidates = {"annealing": best}

    if cfg["solver"] == "qaoa":
        tick(0.7, "Running QAOA on the peak window (statevector simulation)")
        W = int(min(cfg["qaoa_window"], sys.T, 4 if sys.N > 4 else 5))
        W = max(1, W)
        while sys.N * W > 16:
            W -= 1
        peak = int(np.argmax(sys.D))
        t0w = int(min(max(0, peak - W // 2), sys.T - W))
        qa = run_qaoa(sys, best[0], t0w, W=W, p=cfg["qaoa_p"], shots=cfg["qaoa_shots"], lam=cfg["penalty"], seed=cfg["seed"],
                      engine=cfg.get("qaoa_engine", "numpy"), verify=bool(cfg.get("qiskit_verify", True)))
        qk = qa.get("qiskit") or {}
        if qk.get("available") and not qk.get("error"):
            out["meta"]["quantum_backend"] = (f"Qiskit {qk.get('version')} Statevector (QAOA circuit, cross-validated vs NumPy"
                                              f"{'; trained in Qiskit' if qa.get('engine') == 'qiskit' else ''}) / classical simulated annealing")
        qbest, qsamples = None, []
        ranked = sorted(qa["sampled"], key=lambda r: r[2])[:25] + [(int(np.argmin([r[2] for r in qa["sampled"]])), 0, 0)][:0]
        for s, cnt, e in ranked:
            u_try = best[0].copy()
            u_try[:, t0w:t0w + W] = qa["U"][s]
            u, P, m, rep = finalize(sys, u_try)
            qsamples.append({"cost": float(m["cost"]), "feasible": m["feasible"], "repaired": rep, "energy": e, "count": cnt})
            if m["feasible"] and (qbest is None or m["cost"] < qbest[2]["cost"]):
                qbest = (u, P, m)
        if qbest is not None:
            candidates["qaoa"] = qbest
        qa_out = {k: v for k, v in qa.items() if k not in ("U", "sampled", "ground_window")}
        qa_out.update({"samples": qsamples, "metrics": _clean(qbest[2]) if qbest else None,
                       "schedule": _sched(qbest[0], qbest[1]) if qbest else None, "time_s": round(qa["time"], 3),
                       "hybrid": "Annealer sets all hours; QAOA re-optimises the peak window; result repaired + dispatched"})
        out["qaoa"] = qa_out
    else:
        out["qaoa"] = None

    key = min(candidates, key=lambda k: candidates[k][2]["cost"])
    qb = candidates[key]
    allsamples = samples + (out["qaoa"]["samples"] if out["qaoa"] else [])
    out["best_quantum"] = key
    out["summary"] = {
        "classical_cost": float(c_cost), "quantum_cost": float(qb[2]["cost"]),
        "gap_pct": float((qb[2]["cost"] - c_cost) / c_cost * 100.0),
        "feasible_pct": float(100.0 * np.mean([s["feasible"] for s in allsamples])),
        "iterations": int(out["annealing"]["sweeps"]), "circuit_evaluations": out["qaoa"]["circuit_evaluations"] if out["qaoa"] else 0,
        "qubits": out["qaoa"]["qubits"] if out["qaoa"] else None, "circuit_depth": out["qaoa"]["depth_estimate"] if out["qaoa"] else None,
        "qubo_variables": q.n, "max_load_error": float(qb[2]["max_balance_error"]), "reserve_violation": float(qb[2]["reserve_violation"]),
        "runtime_s": round(time.time() - t_all, 2)}
    if cfg.get("robustness"):
        tick(0.9, "Robustness scenarios")
        out["robustness"] = robustness(sys, cfg)
    tick(1.0, "Done")
    return out


def robustness(sys: System, cfg: dict) -> list:
    base = sys.to_dict()
    scen = [("Demand -10%", lambda d: d.update(demand=[x * 0.9 for x in d["demand"]])),
            ("Demand +2%", lambda d: d.update(demand=[x * 1.02 for x in d["demand"]])),
            ("Reserve 12%", lambda d: d.update(reserve_pct=12.0)),
            ("Largest unit outage", lambda d: d.update(generators=[g for g in d["generators"] if g["pmax"] != max(x["pmax"] for x in d["generators"])]))]
    rows = []
    for name, mod in scen:
        d = deepcopy(base)
        mod(d)
        s = System.from_dict(d)
        try:
            mil = solve_milp(s)
            if not mil["success"]:
                rows.append({"scenario": name, "status": "Infeasible", "classical": None, "quantum": None, "gap_pct": None, "feasible": False})
                continue
            _, _, mc, _ = finalize(s, mil["u"])
            q = build_qubo(s, lam=cfg["penalty"])
            sa = anneal(q, reads=24, sweeps=150, seed=cfg["seed"])
            res = [finalize(s, q.decode(x))[2] for x in sa["X"]]
            ok = [m for m in res if m["feasible"]]
            bq = min(ok, key=lambda m: m["cost"]) if ok else None
            rows.append({"scenario": name, "status": "OK", "classical": mc["cost"], "quantum": bq["cost"] if bq else None,
                         "gap_pct": (bq["cost"] - mc["cost"]) / mc["cost"] * 100 if bq else None,
                         "feasible": bool(bq), "feasible_pct": 100.0 * len(ok) / len(res)})
        except Exception as e:  # noqa: BLE001
            rows.append({"scenario": name, "status": f"Error: {e}", "classical": None, "quantum": None, "gap_pct": None, "feasible": False})
    return rows
