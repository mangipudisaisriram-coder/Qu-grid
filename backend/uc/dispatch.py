"""Economic dispatch for a FIXED commitment (convex; piecewise-linear LP, exact to <0.1%)."""
from __future__ import annotations
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix
from .models import System


def pwl_segments(g, K: int):
    w = (g.pmax - g.pmin) / K
    p = g.pmin + w * np.arange(K + 1)
    f = g.a * p ** 2 + g.b * p
    return w, np.diff(f) / w


def _greedy(sys: System, u: np.ndarray) -> np.ndarray:
    """Fallback when the LP is infeasible: Pmin everywhere, then fill by marginal cost (may leave load error)."""
    N, T = sys.N, sys.T
    P = np.zeros((N, T))
    for t in range(T):
        on = [i for i in range(N) if u[i, t]]
        for i in on:
            P[i, t] = sys.generators[i].pmin
        rem = sys.D[t] - P[:, t].sum()
        for i in sorted(on, key=lambda i: sys.generators[i].b + 2 * sys.generators[i].a * sys.generators[i].pmax):
            if rem <= 0:
                break
            add = min(rem, sys.generators[i].pmax - P[i, t])
            P[i, t] += add
            rem -= add
    return P


def economic_dispatch(sys: System, u, K: int = 12, enforce_ramp: bool = True) -> dict:
    u = np.asarray(u, dtype=int)
    N, T = sys.N, sys.T
    pmin = sys.arr("pmin")
    idx = lambda i, t, k: (i * T + t) * K + k
    n = N * T * K
    cost = np.zeros(n)
    ub = np.zeros(n)
    for i, g in enumerate(sys.generators):
        w, sl = pwl_segments(g, K)
        for t in range(T):
            for k in range(K):
                cost[idx(i, t, k)] = sl[k]
                ub[idx(i, t, k)] = w * u[i, t]
    r, c, v = [], [], []
    beq = np.zeros(T)
    for t in range(T):
        for i in range(N):
            for k in range(K):
                r.append(t); c.append(idx(i, t, k)); v.append(1.0)
        beq[t] = sys.D[t] - float((pmin * u[:, t]).sum())
    Aeq = coo_matrix((v, (r, c)), shape=(T, n)).tocsr()

    def solve(ramp: bool):
        rr, cc, vv, b = [], [], [], []
        row = 0
        if ramp:
            for i, g in enumerate(sys.generators):
                for t in range(1, T):
                    if u[i, t] and u[i, t - 1]:      # both on: ramp binds (startup/shutdown steps are exempt)
                        for k in range(K):
                            rr += [row, row + 1, row, row + 1]
                            cc += [idx(i, t, k), idx(i, t, k), idx(i, t - 1, k), idx(i, t - 1, k)]
                            vv += [1.0, -1.0, -1.0, 1.0]
                        b += [g.ramp, g.ramp]
                        row += 2
        Aub = coo_matrix((vv, (rr, cc)), shape=(row, n)).tocsr() if row else None
        bub = np.array(b) if row else None
        return linprog(cost, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=beq, bounds=np.column_stack([np.zeros(n), ub]),
                       method="highs")

    ramp_relaxed = False
    res = solve(enforce_ramp)
    if res.status != 0 and enforce_ramp:
        res = solve(False)
        ramp_relaxed = True
    if res.status != 0:
        return {"P": _greedy(sys, u), "status": "infeasible", "ramp_relaxed": ramp_relaxed, "lp_ok": False}
    d = res.x.reshape(N, T, K).sum(axis=2)
    P = (pmin[:, None] * u + d) * (u > 0)
    return {"P": P, "status": "ok", "ramp_relaxed": ramp_relaxed, "lp_ok": True}
