"""Cost, feasibility checks and the commitment repair heuristic."""
from __future__ import annotations
import numpy as np
from .models import System


def _runs(seq):
    out, s = [], 0
    for t in range(1, len(seq) + 1):
        if t == len(seq) or seq[t] != seq[s]:
            out.append((s, t, int(seq[s])))
            s = t
    return out


def evaluate(sys: System, u, P) -> dict:
    u = np.asarray(u, dtype=int)
    P = np.asarray(P, dtype=float)
    N, T = sys.N, sys.T
    a, b, c = sys.arr("a"), sys.arr("b"), sys.arr("c")
    su, sd = sys.arr("startup"), sys.arr("shutdown")
    u0 = np.array([g.initial_on for g in sys.generators])
    prev = np.concatenate([u0[:, None], u[:, :-1]], axis=1)
    starts = ((u == 1) & (prev == 0)).sum(axis=1)
    stops = ((u == 0) & (prev == 1)).sum(axis=1)
    fuel = float((a[:, None] * P ** 2 + b[:, None] * P).sum())
    noload = float((c[:, None] * u).sum())
    cost = fuel + noload + float((su * starts).sum() + (sd * stops).sum())
    bal = float(np.abs(P.sum(axis=0) - sys.D).max())
    res_viol = float(np.maximum(0, sys.reserve_target - (sys.arr("pmax")[:, None] * u).sum(axis=0)).max())
    lim = float(max(np.maximum(0, P - sys.arr("pmax")[:, None] * u).max(),
                    np.maximum(0, sys.arr("pmin")[:, None] * u - P).max()))
    ramp_v = 0.0
    for i, g in enumerate(sys.generators):
        for t in range(1, T):
            if u[i, t] and u[i, t - 1]:
                ramp_v = max(ramp_v, abs(P[i, t] - P[i, t - 1]) - g.ramp)
    mud = 0
    for i, g in enumerate(sys.generators):
        seq = [int(u0[i])] + list(u[i])
        for s, e, val in _runs(seq):
            if s == 0 or e == len(seq):      # initial run / run cut by horizon end are not violations
                continue
            if (e - s) < (g.min_up if val else g.min_down):
                mud += 1
    feasible = bal <= 0.5 and res_viol <= 1e-6 and ramp_v <= 0.5 and mud == 0 and lim <= 0.5
    return {"cost": cost, "fuel_cost": fuel, "noload_cost": noload,
            "startup_cost": float((su * starts).sum()), "shutdown_cost": float((sd * stops).sum()),
            "num_startups": int(starts.sum()), "max_balance_error": bal, "reserve_violation": res_viol,
            "ramp_violation": max(0.0, ramp_v), "limit_violation": lim, "updown_violations": int(mud),
            "feasible": bool(feasible)}


def repair(sys: System, u) -> np.ndarray:
    """Greedy repair: reserve, over-commitment (sum Pmin > D) and min up/down time."""
    u = np.array(u, dtype=int)
    N, T = sys.N, sys.T
    gens = sys.generators
    pmax, pmin = sys.arr("pmax"), sys.arr("pmin")
    rank = sorted(range(N), key=lambda i: gens[i].b + gens[i].a * gens[i].pmax + gens[i].c / gens[i].pmax)
    u0 = [g.initial_on for g in gens]
    for _ in range(8):
        changed = False
        for t in range(T):                                   # 1. reserve
            while (pmax * u[:, t]).sum() < sys.reserve_target[t] - 1e-9:
                off = [i for i in rank if not u[i, t]]
                if not off:
                    break
                u[off[0], t] = 1
                changed = True
        for t in range(T):                                   # 2. over-commitment
            while (pmin * u[:, t]).sum() > sys.D[t] + 1e-9:
                cand = [i for i in reversed(rank) if u[i, t] and
                        (pmax * u[:, t]).sum() - pmax[i] >= sys.reserve_target[t] - 1e-9]
                if not cand:
                    break
                u[cand[0], t] = 0
                changed = True
        for i, g in enumerate(gens):                         # 3. min up / min down
            for _ in range(10):
                seq = [u0[i]] + list(u[i])
                fixed = False
                for s, e, val in _runs(seq):
                    if s == 0 or e == len(seq):
                        continue
                    if (e - s) < (g.min_up if val else g.min_down):
                        u[i, s - 1:e - 1] = 1                # short OFF gap -> fill with ON
                        if val:                              # short ON run -> extend to min_up
                            u[i, e - 1:min(T, s - 1 + g.min_up)] = 1
                        fixed = changed = True
                        break
                if not fixed:
                    break
        if not changed:
            break
    return u
