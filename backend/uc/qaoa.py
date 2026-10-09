"""QAOA on a pure-NumPy statevector simulator (no Qiskit needed; NO quantum hardware is used).

Because 5 units x 24 h = 120+ qubits is far beyond simulation, QAOA optimises a short WINDOW of hours
(default 3 h x N units = 15 qubits) around the demand peak; the other hours come from the annealer. The cost
Hamiltonian is diagonal: the same cost/start-up terms as the QUBO plus an exact reserve hinge penalty
(slack-free, so the window needs no ancilla qubits)."""
from __future__ import annotations
import time
import numpy as np
from scipy.optimize import minimize
from .models import System
from .qubo import unit_hour_costs
from . import qiskit_bridge as qkb


def window_diagonal(sys: System, base_u: np.ndarray, t0: int, W: int, lam: float):
    N, T = sys.N, sys.T
    n = N * W
    S = 1 << n
    bits = ((np.arange(S)[:, None] >> np.arange(n)) & 1).astype(np.int8)
    U = bits.reshape(S, N, W)                       # qubit index = i*W + w
    C = unit_hour_costs(sys)
    su, sd, pmax = sys.arr("startup"), sys.arr("shutdown"), sys.arr("pmax")
    E = (U * C[None, :, t0:t0 + W]).sum(axis=(1, 2)).astype(float)
    prev0 = base_u[:, t0 - 1] if t0 > 0 else np.array([g.initial_on for g in sys.generators])
    for w in range(W):
        prev = prev0[None, :] if w == 0 else U[:, :, w - 1]
        cur = U[:, :, w]
        E += (su * (cur * (1 - prev))).sum(1) + (sd * (prev * (1 - cur))).sum(1)
    if t0 + W < T:
        nxt, last = base_u[:, t0 + W][None, :], U[:, :, W - 1]
        E += (su * (nxt * (1 - last))).sum(1) + (sd * (last * (1 - nxt))).sum(1)
    cap = (U * pmax[None, :, None]).sum(axis=1)
    E += lam * (np.maximum(0, sys.reserve_target[t0:t0 + W][None, :] - cap) ** 2).sum(axis=1)
    return E, U


def _mixer(psi, beta, n):
    c, s = np.cos(beta), -1j * np.sin(beta)
    for q in range(n):
        v = psi.reshape(-1, 2, 1 << q)
        a, b = v[:, 0, :].copy(), v[:, 1, :].copy()
        v[:, 0, :] = c * a + s * b
        v[:, 1, :] = s * a + c * b
    return psi


def _depth_estimate(N, W, p):
    edges = [(i * W + w, j * W + w) for w in range(W) for i in range(N) for j in range(i + 1, N)]
    edges += [(i * W + w, i * W + w + 1) for i in range(N) for w in range(W - 1)]
    rounds = []
    for e in edges:
        for r in rounds:
            if not ({e[0], e[1]} & r):
                r.update(e)
                break
        else:
            rounds.append(set(e))
    return p * (len(rounds) + 2) + 1, len(edges)


def run_qaoa(sys: System, base_u: np.ndarray, t0: int, W: int = 3, p: int = 2, shots: int = 2048,
             lam: float = 5.0, restarts: int = 3, maxiter: int = 120, seed: int = 11,
             engine: str = "numpy", verify: bool = True, qiskit_budget_s: float = 90.0) -> dict:
    """engine="numpy": train with the fast NumPy simulator.  engine="qiskit": train by simulating the Qiskit circuit
    (slower; falls back to NumPy if Qiskit is missing or fails).  verify=True re-builds the final circuit in Qiskit
    (when installed) and cross-validates it against the NumPy simulation."""
    t_start = time.time()
    rng = np.random.default_rng(seed)
    n = sys.N * W
    E, U = window_diagonal(sys, base_u, t0, W, lam)
    e_min = float(E.min())
    scale = float(max(np.median(E) - e_min, 1e-9))
    Cn = (E - e_min) / scale
    S = 1 << n
    trace, evals = [], [0]
    best = {"val": np.inf, "x": None}

    probs_fn, engine_used, engine_note = None, "numpy", None
    if engine == "qiskit":
        if qkb.qiskit_available():
            try:
                probs_fn = qkb.make_probability_fn(Cn, n, p, max_seconds=qiskit_budget_s)
                engine_used = "qiskit"
                restarts, maxiter = min(restarts, 1), min(maxiter, 40)    # each evaluation simulates a full circuit
            except Exception as e:  # noqa: BLE001
                engine_note = f"Qiskit training unavailable ({type(e).__name__}); used NumPy"
        else:
            engine_note = "Qiskit not installed; used NumPy"

    def np_probs(g, b):
        psi = np.full(S, 1 / np.sqrt(S), dtype=complex)
        for l in range(p):
            psi *= np.exp(-1j * g[l] * Cn)
            _mixer(psi, b[l], n)
        return np.abs(psi) ** 2

    def expect(params):
        g, b = params[:p], params[p:]
        pr = (probs_fn or np_probs)(g, b)
        val = float(pr @ Cn)
        evals[0] += 1
        if val < best["val"]:
            best["val"], best["x"] = val, params.copy()
        trace.append({"iteration": evals[0], "expected_cost": e_min + best["val"] * scale})
        return val

    def train():
        for _ in range(restarts):
            x0 = rng.uniform(0, np.pi, size=2 * p)
            minimize(expect, x0, method="COBYLA", options={"maxiter": maxiter, "rhobeg": 0.4})

    try:
        train()
    except qkb.BudgetExceeded:
        engine_note = f"Qiskit training stopped at its {qiskit_budget_s:.0f}s budget; best angles so far kept"
    except Exception as e:  # noqa: BLE001  - Qiskit path failed: redo the training with NumPy
        engine_used, engine_note, probs_fn = "numpy", f"Qiskit training failed ({type(e).__name__}); used NumPy", None
        trace.clear(); evals[0] = 0; best["val"], best["x"] = np.inf, None
        train()
    if best["x"] is None:                                  # Qiskit budget hit before the first evaluation finished
        probs_fn, engine_used = None, "numpy"
        train()
    g, b = best["x"][:p], best["x"][p:]
    pr = np_probs(g, b)
    pr /= pr.sum()
    draws = rng.choice(S, size=shots, p=pr)
    uniq, counts = np.unique(draws, return_counts=True)
    ground = int(np.argmin(E))
    depth, zz = _depth_estimate(sys.N, W, p)
    qk = qkb.verify(Cn, E, pr, g, b, n, p, shots, seed) if verify else {"available": None, "reason": "verification disabled"}
    return {"window": {"start": int(t0), "hours": int(W)}, "qubits": int(n), "p": int(p), "shots": int(shots),
            "gamma": [float(x) for x in g], "beta": [float(x) for x in b],
            "expected_cost": float(e_min + best["val"] * scale), "window_optimum_cost": e_min,
            "window_mean_cost": float(E.mean()),
            "ground_state_probability": float(pr[ground]), "uniform_ground_probability": 1.0 / S,
            "circuit_evaluations": int(evals[0]), "depth_estimate": int(depth), "zz_terms": int(zz),
            "convergence": trace, "sampled": [(int(s), int(c), float(E[s])) for s, c in zip(uniq, counts)],
            "ground_window": U[ground].astype(int), "U": U, "time": time.time() - t_start,
            "engine": engine_used, "engine_note": engine_note, "qiskit": qk}
