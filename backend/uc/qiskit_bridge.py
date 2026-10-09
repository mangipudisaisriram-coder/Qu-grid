"""Qiskit bridge for the QAOA window.

The window's cost Hamiltonian is DIAGONAL: H_C|z> = Cn[z]|z>.  Any diagonal operator on n qubits is an exact
sum of Pauli-Z strings (a Walsh-Hadamard transform), so the QAOA cost layer exp(-i*gamma*H_C) can be built with
Qiskit's own PauliEvolutionGate.  The circuit is

    |+>^n  ->  [ exp(-i*gamma_l*H_C)  ->  RX(2*beta_l) on every qubit ]  for l = 1..p

which is exactly what the NumPy simulator in qaoa.py computes (same qubit convention: qubit k = bit k of the
basis-state index = Qiskit's little-endian order).  This module

  * converts the cost function to Pauli terms (pure NumPy - always available and unit-tested),
  * builds the circuit with Qiskit, simulates it, and CROSS-VALIDATES it against the NumPy simulator,
  * transpiles it to a hardware-style basis ({rz, sx, x, cx}) and reports real gate counts / depth,
  * can optionally drive the training loop (engine="qiskit").

Everything that needs Qiskit is optional: if Qiskit is not installed the rest of the pipeline is unaffected.
NO quantum hardware is used here; see scripts/run_on_ibm_quantum.py for the optional real-device run.
"""
from __future__ import annotations
import time
import numpy as np

BASIS = ["rz", "sx", "x", "cx"]


class BudgetExceeded(Exception):
    """Raised inside the Qiskit-driven training loop when its time budget is used up."""


# ----------------------------------------------------------------------------- pure NumPy (no Qiskit needed)
def pauli_z_terms(Cn: np.ndarray, n: int, tol: float = 1e-10):
    """Exact Walsh-Hadamard decomposition  Cn[z] = c0 + sum_S c_S * prod_{k in S} (-1)^{z_k}.

    Returns (c0, [(qubit_indices, coefficient), ...]).  Bit k of the state index is qubit k."""
    c = np.asarray(Cn, dtype=float).copy()
    assert c.size == 1 << n
    for k in range(n):                                   # in-place fast Walsh-Hadamard transform
        v = c.reshape(-1, 2, 1 << k)
        a, b = v[:, 0, :].copy(), v[:, 1, :].copy()
        v[:, 0, :], v[:, 1, :] = a + b, a - b
    c /= float(1 << n)
    c0 = float(c[0])
    terms = []
    for S in np.nonzero(np.abs(c) > tol)[0]:
        if S == 0:
            continue
        terms.append(([k for k in range(n) if (int(S) >> k) & 1], float(c[S])))
    return c0, terms


def reconstruct_from_terms(c0: float, terms, n: int) -> np.ndarray:
    """Evaluate c0 + sum c_S Z_S on every basis state (used by the tests)."""
    idx = np.arange(1 << n)
    out = np.full(1 << n, c0, dtype=float)
    for qs, coef in terms:
        parity = np.zeros(1 << n, dtype=np.int64)
        for k in qs:
            parity ^= (idx >> k) & 1
        out += coef * (1 - 2 * parity)
    return out


# ----------------------------------------------------------------------------- Qiskit (optional)
def qiskit_available() -> bool:
    try:
        import qiskit  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False


def qiskit_version() -> str | None:
    try:
        import qiskit
        return str(qiskit.__version__)
    except Exception:  # noqa: BLE001
        return None


def cost_operator(Cn: np.ndarray, n: int):
    """Qiskit SparsePauliOp equal to diag(Cn) up to the (physically irrelevant) constant c0."""
    from qiskit.quantum_info import SparsePauliOp
    c0, terms = pauli_z_terms(Cn, n)
    if not terms:
        return None, c0, 0, 0
    sparse = [("Z" * len(qs), qs, coef) for qs, coef in terms]
    op = SparsePauliOp.from_sparse_list(sparse, num_qubits=n)
    return op, c0, len(terms), max(len(qs) for qs, _ in terms)


def build_qaoa_circuit(op, n: int, p: int):
    """Parametrised QAOA circuit. Returns (circuit, gamma_params, beta_params)."""
    from qiskit import QuantumCircuit
    from qiskit.circuit import ParameterVector
    from qiskit.circuit.library import PauliEvolutionGate
    gam, bet = ParameterVector("gamma", p), ParameterVector("beta", p)
    qc = QuantumCircuit(n, name="QAOA_UC_window")
    qc.h(range(n))
    for l in range(p):
        if op is not None:
            qc.append(PauliEvolutionGate(op, time=gam[l]), range(n))      # exp(-i gamma H_C)
        for q in range(n):
            qc.rx(2 * bet[l], q)                                          # exp(-i beta X)
    return qc, gam, bet


def _bind(qc, gam, bet, g, b):
    return qc.assign_parameters({**{gam[i]: float(g[i]) for i in range(len(gam))},
                                 **{bet[i]: float(b[i]) for i in range(len(bet))}})


def make_probability_fn(Cn: np.ndarray, n: int, p: int, max_seconds: float | None = None):
    """Returns f(gammas, betas) -> measurement probabilities, computed by simulating the Qiskit circuit."""
    from qiskit.quantum_info import Statevector
    op, _, _, _ = cost_operator(Cn, n)
    qc, gam, bet = build_qaoa_circuit(op, n, p)
    t0 = time.time()

    def probs(g, b):
        if max_seconds is not None and time.time() - t0 > max_seconds:
            raise BudgetExceeded()
        return np.asarray(Statevector(_bind(qc, gam, bet, g, b)).probabilities(), dtype=float)
    return probs


def verify(Cn: np.ndarray, E: np.ndarray, pr_numpy: np.ndarray, g, b, n: int, p: int, shots: int, seed: int) -> dict:
    """Build the QAOA circuit in Qiskit with the trained angles, simulate + sample it, transpile it, and compare
    with the NumPy simulator.  Never raises: on any problem it returns {'available': ..., 'error': ...}."""
    if not qiskit_available():
        return {"available": False, "reason": "qiskit is not installed (pip install qiskit) - NumPy simulator used"}
    try:
        from qiskit import transpile
        from qiskit.quantum_info import Statevector
        t0 = time.time()
        op, c0, n_terms, max_w = cost_operator(Cn, n)
        qc, gam, bet = build_qaoa_circuit(op, n, p)
        bound = _bind(qc, gam, bet, g, b)

        sv = Statevector(bound)
        pr_q = np.asarray(sv.probabilities(), dtype=float)
        tvd = float(0.5 * np.abs(pr_q - pr_numpy).sum())
        fidelity = float(np.sum(np.sqrt(np.clip(pr_q, 0, None) * np.clip(pr_numpy, 0, None))) ** 2)

        sv.seed(int(seed))
        counts = sv.sample_counts(int(shots))
        top = sorted(((int(k, 2), int(v)) for k, v in counts.items()), key=lambda kv: -kv[1])[:8]

        tqc = transpile(bound, basis_gates=BASIS, optimization_level=1, seed_transpiler=int(seed))
        ops = {str(k): int(v) for k, v in tqc.count_ops().items()}
        ground = int(np.argmin(E))
        return {
            "available": True, "version": qiskit_version(), "simulator": "qiskit.quantum_info.Statevector",
            "pauli_terms": int(n_terms), "max_pauli_weight": int(max_w),
            "transpiled": {"basis_gates": BASIS, "depth": int(tqc.depth()), "size": int(tqc.size()),
                           "two_qubit_gates": int(tqc.num_nonlocal_gates()), "ops": ops},
            "cross_validation": {"total_variation_distance": tvd, "fidelity": fidelity, "passed": bool(tvd < 1e-6)},
            "expected_cost": float(pr_q @ E), "ground_state_probability": float(pr_q[ground]),
            "top_outcomes": [{"state": s, "bitstring": format(s, f"0{n}b"), "count": c, "cost": float(E[s]),
                              "is_ground": bool(s == ground)} for s, c in top],
            "time_s": round(time.time() - t0, 3),
        }
    except Exception as e:  # noqa: BLE001  - verification must never break an optimisation run
        return {"available": True, "version": qiskit_version(), "error": f"{type(e).__name__}: {e}"}
