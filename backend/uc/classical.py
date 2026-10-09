"""Classical baseline: mixed-integer UC (u, y, z binary) solved with HiGHS via scipy.optimize.milp.
The quadratic fuel curve is approximated by K convex piecewise-linear segments."""
from __future__ import annotations
import time
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import coo_matrix
from .models import System
from .dispatch import pwl_segments


def solve_milp(sys: System, K: int = 4, time_limit: float = 30.0, gap: float = 1e-3) -> dict:
    N, T = sys.N, sys.T
    nv = 3 + K
    idx = lambda i, t, v: (i * T + t) * nv + v          # v: 0=u 1=y 2=z 3..=delta_k
    n = N * T * nv
    cost = np.zeros(n)
    lb, ub = np.zeros(n), np.ones(n)
    integ = np.zeros(n)
    for i, g in enumerate(sys.generators):
        w, sl = pwl_segments(g, K)
        for t in range(T):
            cost[idx(i, t, 0)] = g.a * g.pmin ** 2 + g.b * g.pmin + g.c
            cost[idx(i, t, 1)] = g.startup
            cost[idx(i, t, 2)] = g.shutdown
            integ[[idx(i, t, 0), idx(i, t, 1), idx(i, t, 2)]] = 1
            for k in range(K):
                cost[idx(i, t, 3 + k)] = sl[k]
                ub[idx(i, t, 3 + k)] = w
    R, C, V, lo, hi = [], [], [], [], []

    def add(terms, l, h):
        r = len(lo)
        for j, v in terms:
            R.append(r); C.append(j); V.append(v)
        lo.append(l); hi.append(h)

    def P(i, t, coef=1.0):
        g = sys.generators[i]
        return [(idx(i, t, 0), coef * g.pmin)] + [(idx(i, t, 3 + k), coef) for k in range(K)]

    for t in range(T):
        add([x for i in range(sys.N) for x in P(i, t)], sys.D[t], sys.D[t])                                  # balance
        add([(idx(i, t, 0), g.pmax) for i, g in enumerate(sys.generators)], sys.reserve_target[t], np.inf)  # reserve
    for i, g in enumerate(sys.generators):
        for t in range(T):
            add([(idx(i, t, 3 + k), 1.0) for k in range(K)] + [(idx(i, t, 0), -(g.pmax - g.pmin))], -np.inf, 0)
            add([(idx(i, t, 1), 1.0), (idx(i, t, 2), 1.0)], -np.inf, 1)
            if t == 0:
                add([(idx(i, 0, 0), 1), (idx(i, 0, 1), -1), (idx(i, 0, 2), 1)], g.initial_on, g.initial_on)
            else:
                add([(idx(i, t, 0), 1), (idx(i, t - 1, 0), -1), (idx(i, t, 1), -1), (idx(i, t, 2), 1)], 0, 0)
            s = max(0, t - g.min_up + 1)
            add([(idx(i, k, 1), 1.0) for k in range(s, t + 1)] + [(idx(i, t, 0), -1.0)], -np.inf, 0)
            s = max(0, t - g.min_down + 1)
            add([(idx(i, k, 2), 1.0) for k in range(s, t + 1)] + [(idx(i, t, 0), 1.0)], -np.inf, 1)
            if t >= 1:                                                                                       # ramping
                add(P(i, t) + P(i, t - 1, -1.0) + [(idx(i, t, 1), -g.pmin)], -np.inf, g.ramp)
                add(P(i, t - 1) + P(i, t, -1.0) + [(idx(i, t, 2), -g.pmin)], -np.inf, g.ramp)
    A = coo_matrix((V, (R, C)), shape=(len(lo), n)).tocsr()
    t0 = time.time()
    res = milp(cost, constraints=LinearConstraint(A, np.array(lo), np.array(hi)), integrality=integ,
               bounds=Bounds(lb, ub), options={"time_limit": time_limit, "mip_rel_gap": gap})
    elapsed = time.time() - t0
    if res.x is None:
        return {"u": None, "status": res.message, "time": elapsed, "success": False}
    u = np.array([[round(res.x[idx(i, t, 0)]) for t in range(T)] for i in range(N)], dtype=int)
    return {"u": u, "status": res.message, "time": elapsed, "success": True, "objective_pwl": float(res.fun),
            "num_vars": n, "num_constraints": len(lo), "mip_gap": getattr(res, "mip_gap", None)}
