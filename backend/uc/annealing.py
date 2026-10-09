"""Simulated annealing on the QUBO (classical baseline for quantum annealing). Chains run in parallel (vectorised)."""
from __future__ import annotations
import numpy as np
from .qubo import QUBO


def anneal(q: QUBO, reads: int = 48, sweeps: int = 300, t_hot: float = 3000.0, t_cold: float = 3.0,
           seed: int = 7, checkpoints: int = 12) -> dict:
    rng = np.random.default_rng(seed)
    n = q.n
    Q = q.Q
    diag = np.diag(Q).copy()
    X = rng.integers(0, 2, size=(reads, n)).astype(float)
    H = X @ Q                                            # (Qx)_i for every chain (Q symmetric)
    temps = t_hot * (t_cold / t_hot) ** (np.arange(sweeps) / max(1, sweeps - 1))
    cp = set(np.linspace(0, sweeps - 1, checkpoints).astype(int).tolist())
    trace = []
    for s, T_ in enumerate(temps):
        for i in rng.permutation(n):
            d = 1.0 - 2.0 * X[:, i]
            dE = 2.0 * d * H[:, i] + diag[i]            # exact energy change of flipping bit i
            acc = (dE <= 0) | (rng.random(reads) < np.exp(-np.clip(dE, 0, None) / T_))
            if acc.any():
                X[acc, i] += d[acc]
                H[acc] += d[acc, None] * Q[i][None, :]
        if s in cp:
            E = (X * H).sum(axis=1) + q.offset
            b = int(np.argmin(E))
            trace.append({"sweep": s + 1, "temperature": float(T_), "best_energy": float(E[b]),
                          "mean_energy": float(E.mean()), "x": X[b].astype(int).copy()})
    E = (X * H).sum(axis=1) + q.offset
    order = np.argsort(E)
    return {"X": X[order].astype(int), "energies": E[order], "trace": trace, "reads": reads, "sweeps": sweeps}
