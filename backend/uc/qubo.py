"""QUBO for the binary commitment variables u[i,t] (recommended 'Option B': power P is solved classically).

E(x) = x^T Q x + offset, with x = [u_00..u_{N-1,T-1} | slack bits]
  * per-unit-hour cost  c_i + min_P [a P^2 + (b - lambda_t) P]   (Lagrangian relaxation of load balance;
                                                                  lambda_t = system marginal price)
  * start-up  S*u_t(1-u_{t-1})  and shut-down  D*u_{t-1}(1-u_t)  (exact quadratic terms)
  * reserve   lam * (sum_i Pmax_i u_it - slack_t - D_t(1+R))^2   (slack = binary-encoded, inequality -> equality)
Min up/down time is NOT encoded (it would need cubic terms); it is enforced by `evaluate.repair`.
"""
from __future__ import annotations
from dataclasses import dataclass
import numpy as np
from .models import System


def lagrange_prices(sys: System) -> np.ndarray:
    a, b, pmax = sys.arr("a"), sys.arr("b"), sys.arr("pmax")
    lam = np.zeros(sys.T)
    for t in range(sys.T):
        lo, hi = 0.0, 500.0
        for _ in range(60):
            m = (lo + hi) / 2
            p = np.clip((m - b) / np.maximum(2 * a, 1e-9), 0, pmax)
            lo, hi = (m, hi) if p.sum() < sys.D[t] else (lo, m)
        lam[t] = hi
    return lam


def unit_hour_costs(sys: System) -> np.ndarray:
    """N x T linear coefficient of u[i,t]."""
    lam = lagrange_prices(sys)
    out = np.zeros((sys.N, sys.T))
    for i, g in enumerate(sys.generators):
        p = np.clip((lam - g.b) / max(2 * g.a, 1e-9), g.pmin, g.pmax)
        out[i] = g.c + g.a * p ** 2 + (g.b - lam) * p
    return out


@dataclass
class QUBO:
    Q: np.ndarray
    offset: float
    N: int
    T: int
    n_u: int
    slack_bits: int
    lam: float

    @property
    def n(self) -> int:
        return self.Q.shape[0]

    def energy(self, x) -> float:
        x = np.asarray(x, dtype=float)
        return float(x @ self.Q @ x + self.offset)

    def decode(self, x) -> np.ndarray:
        return np.asarray(x[: self.n_u]).reshape(self.N, self.T).astype(int)


def build_qubo(sys: System, lam: float = 5.0, step: float = 10.0) -> QUBO:
    N, T = sys.N, sys.T
    pmax = sys.arr("pmax")
    Rq = sys.reserve_target
    levels = max(1, int(np.ceil((pmax.sum() - Rq.min()) / step)))
    m = max(1, int(np.ceil(np.log2(levels + 1))))
    weights = [2 ** k for k in range(m - 1)] + [levels - (2 ** (m - 1) - 1)]
    n_u = N * T
    n = n_u + T * m
    Q = np.zeros((n, n))
    off = 0.0
    uid = lambda i, t: i * T + t

    # per-unit-hour cost
    C = unit_hour_costs(sys)
    for i in range(N):
        for t in range(T):
            Q[uid(i, t), uid(i, t)] = C[i, t]

    for i, g in enumerate(sys.generators):                   # start-up / shut-down
        for t in range(T):
            if t == 0:
                p0 = g.initial_on
                Q[uid(i, 0), uid(i, 0)] += g.startup * (1 - p0) - g.shutdown * p0
                off += g.shutdown * p0
            else:
                Q[uid(i, t), uid(i, t)] += g.startup
                Q[uid(i, t - 1), uid(i, t - 1)] += g.shutdown
                Q[uid(i, t), uid(i, t - 1)] += -(g.startup + g.shutdown) / 2
                Q[uid(i, t - 1), uid(i, t)] += -(g.startup + g.shutdown) / 2

    for t in range(T):                                       # reserve with slack
        ids = [uid(i, t) for i in range(N)] + [n_u + t * m + k for k in range(m)]
        co = list(pmax) + [-w * step for w in weights]
        for a_, ia in zip(co, ids):
            Q[ia, ia] += lam * (a_ * a_ - 2 * Rq[t] * a_)
        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                v = lam * co[x] * co[y]
                Q[ids[x], ids[y]] += v
                Q[ids[y], ids[x]] += v
        off += lam * Rq[t] ** 2
    return QUBO(Q, off, N, T, n_u, m, lam)
