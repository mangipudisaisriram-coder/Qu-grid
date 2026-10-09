"""Core tests (no network, no FastAPI needed):  pytest backend/tests   or   python backend/tests/test_uc.py"""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from uc.models import default_system, System
from uc.classical import solve_milp
from uc.dispatch import economic_dispatch
from uc.evaluate import evaluate, repair
from uc.qubo import build_qubo
from uc.annealing import anneal
from uc.qaoa import window_diagonal, run_qaoa
from uc.pipeline import run_pipeline, finalize
from uc import qiskit_bridge as qkb
from app import auth

S = default_system()


def test_milp_feasible_and_checked_independently():
    r = solve_milp(S)
    assert r["success"]
    d = economic_dispatch(S, r["u"])
    m = evaluate(S, r["u"], d["P"])
    assert m["feasible"] and m["max_balance_error"] < 1e-6 and m["reserve_violation"] == 0
    assert np.allclose(d["P"].sum(axis=0), S.D)


def test_dispatch_respects_limits_and_ramp():
    u = np.ones((S.N, S.T), dtype=int)
    P = economic_dispatch(S, u)["P"]
    assert (P <= S.arr("pmax")[:, None] + 1e-6).all() and (P >= S.arr("pmin")[:, None] - 1e-6).all()
    assert np.abs(np.diff(P, axis=1)).max() <= S.arr("ramp").max() + 1e-6


def test_qubo_energy_matches_direct_formula():
    q = build_qubo(S)
    rng = np.random.default_rng(1)
    from uc.qubo import unit_hour_costs
    C = unit_hour_costs(S)
    for _ in range(5):
        u = rng.integers(0, 2, size=(S.N, S.T))
        # slack chosen optimally per hour -> reserve term reduces to lam*(shortfall mod step residue)^2; check commitment-only terms
        x = np.concatenate([u.ravel(), np.zeros(q.n - q.n_u)])
        u0 = np.array([g.initial_on for g in S.generators])
        prev = np.concatenate([u0[:, None], u[:, :-1]], axis=1)
        direct = (C * u).sum() + (S.arr("startup")[:, None] * (u * (1 - prev))).sum() + (S.arr("shutdown")[:, None] * (prev * (1 - u))).sum()
        direct += q.lam * ((S.arr("pmax")[:, None] * u).sum(0) - S.reserve_target) @ ((S.arr("pmax")[:, None] * u).sum(0) - S.reserve_target)
        assert abs(q.energy(x) - direct) < 1e-6 * max(1, abs(direct))


def test_annealer_improves_on_random():
    q = build_qubo(S)
    sa = anneal(q, reads=8, sweeps=60, seed=3)
    rnd = np.random.default_rng(0).integers(0, 2, size=(8, q.n))
    assert sa["energies"].min() < np.mean([q.energy(x) for x in rnd])


def test_repair_fixes_min_updown_and_reserve():
    bad = np.zeros((S.N, S.T), dtype=int)
    bad[0, ::2] = 1                                   # flickering unit, almost no capacity
    u, P, m, _ = finalize(S, bad)
    assert m["reserve_violation"] == 0 and m["updown_violations"] == 0


def test_qaoa_beats_uniform_sampling():
    base = np.ones((S.N, S.T), dtype=int)
    r = run_qaoa(S, base, t0=10, W=2, p=1, shots=512, restarts=2, maxiter=40)     # 10 qubits: fast
    assert r["qubits"] == 10 and r["ground_state_probability"] > 10 * r["uniform_ground_probability"]
    assert r["expected_cost"] < r["window_mean_cost"]


def test_cost_function_is_an_exact_pauli_z_sum():
    """The bridge to Qiskit: the diagonal QAOA cost is reproduced EXACTLY by a sparse sum of Pauli-Z strings."""
    base = np.ones((S.N, S.T), dtype=int)
    E, _ = window_diagonal(S, base, 10, 2, 5.0)              # 10 qubits
    Cn = (E - E.min()) / max(np.median(E) - E.min(), 1e-9)
    c0, terms = qkb.pauli_z_terms(Cn, 10)
    assert np.allclose(qkb.reconstruct_from_terms(c0, terms, 10), Cn, atol=1e-9)
    assert len(terms) < 200 and max(len(q) for q, _ in terms) <= S.N      # sparse, at most one hour's units per term


def test_qiskit_circuit_matches_numpy_simulator():
    if not qkb.qiskit_available():
        print("   (skipped: qiskit not installed)")
        return
    base = np.ones((S.N, S.T), dtype=int)
    r = run_qaoa(S, base, t0=10, W=2, p=1, shots=512, restarts=1, maxiter=25)
    q = r["qiskit"]
    assert q["available"] and "error" not in q, q
    assert q["cross_validation"]["passed"] and q["cross_validation"]["fidelity"] > 1 - 1e-9
    assert abs(q["expected_cost"] - r["expected_cost"]) < 1e-6 * max(1.0, abs(r["expected_cost"]))
    assert q["transpiled"]["depth"] > 0 and q["transpiled"]["two_qubit_gates"] > 0


def test_qiskit_engine_falls_back_cleanly():
    base = np.ones((S.N, S.T), dtype=int)
    r = run_qaoa(S, base, t0=10, W=1, p=1, shots=128, restarts=1, maxiter=15, engine="qiskit", qiskit_budget_s=60)
    assert r["engine"] in ("qiskit", "numpy") and r["expected_cost"] <= r["window_mean_cost"] + 1e-9
    if not qkb.qiskit_available():
        assert r["engine"] == "numpy" and r["qiskit"]["available"] is False


def test_full_pipeline_gap_is_small_and_honest():
    res = run_pipeline(S, {"solver": "annealing", "reads": 16, "sweeps": 120})
    assert res["meta"]["is_quantum_hardware"] is False
    assert res["classical"]["metrics"]["feasible"]
    assert res["summary"]["gap_pct"] > -0.5          # a heuristic cannot beat the MILP optimum (beyond PWL error)
    assert res["summary"]["gap_pct"] < 15


def test_infeasible_system_reports_error():
    d = S.to_dict(); d["demand"] = [5000.0] * S.T
    try:
        run_pipeline(System.from_dict(d))
        assert False, "should raise"
    except RuntimeError as e:
        assert "infeasible" in str(e).lower()


def test_auth_roundtrip_and_tamper():
    h = auth.hash_password("correct horse")
    assert auth.verify_password("correct horse", h) and not auth.verify_password("wrong", h)
    tok = auth.make_token(42)
    assert auth.read_token(tok) == 42
    assert auth.read_token(tok[:-2] + "xx") is None and auth.read_token(auth.make_token(1, ttl=-5)) is None


if __name__ == "__main__":
    fails = 0
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            try:
                f(); print("PASS", n)
            except Exception as e:  # noqa: BLE001
                fails += 1; print("FAIL", n, type(e).__name__, e)
    sys.exit(1 if fails else 0)
