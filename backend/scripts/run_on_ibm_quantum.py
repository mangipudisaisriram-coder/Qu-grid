"""Run the unit-commitment QAOA window on REAL IBM Quantum hardware (optional).

    pip install qiskit qiskit-ibm-runtime
    python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S; S.save_account(token='YOUR_IBM_QUANTUM_API_KEY', overwrite=True)"
    python scripts/run_on_ibm_quantum.py --dry-run                 # build + transpile only, no account needed
    python scripts/run_on_ibm_quantum.py --hours 1 --shots 4000    # 5 qubits on the least-busy real device
    python scripts/run_on_ibm_quantum.py --hours 2 --backend ibm_brisbane

What it does
  1. Solves the MILP baseline and picks a short window of hours around the demand peak.
  2. Trains the QAOA angles with the fast simulator (training on hardware would waste queue time).
  3. Builds the circuit in Qiskit, transpiles it for the chosen device and runs it with SamplerV2.
  4. Compares the hardware counts with the noiseless simulation and writes data/ibm_hardware_run.json.

Honest expectations: today's devices are noisy, so with 5-10 qubits the hardware distribution is a degraded
version of the ideal one.  The point is an end-to-end, reproducible hardware run with the noise measured, not a
claim of quantum advantage.  Keep --hours at 1 or 2 (5 or 10 qubits); deeper circuits are mostly noise.
"""
from __future__ import annotations
import argparse, json, os, sys, time
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from uc.models import default_system                      # noqa: E402
from uc.classical import solve_milp                       # noqa: E402
from uc.qaoa import run_qaoa, window_diagonal             # noqa: E402
from uc import qiskit_bridge as qkb                       # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hours", type=int, default=1, help="window length in hours (qubits = 5 x hours); keep <= 2")
    ap.add_argument("--p", type=int, default=1, help="QAOA depth (1 recommended on real devices)")
    ap.add_argument("--shots", type=int, default=4000)
    ap.add_argument("--backend", default=None, help="device name; default = least busy real device")
    ap.add_argument("--penalty", type=float, default=5.0)
    ap.add_argument("--dry-run", action="store_true", help="build and transpile only; do not contact IBM Quantum")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data", "ibm_hardware_run.json"))
    a = ap.parse_args()
    if not qkb.qiskit_available():
        sys.exit("Qiskit is not installed:  pip install qiskit qiskit-ibm-runtime")

    S = default_system()
    mil = solve_milp(S)
    base_u = np.asarray(mil["u"], dtype=int)
    W = max(1, a.hours)
    peak = int(np.argmax(S.D))
    t0 = int(min(max(0, peak - W // 2), S.T - W))
    n = S.N * W

    print(f"[1/4] window: hours {t0}-{t0 + W - 1}, {n} qubits, p={a.p}")
    r = run_qaoa(S, base_u, t0, W=W, p=a.p, shots=a.shots, lam=a.penalty, restarts=3, maxiter=80, verify=False)
    E, _ = window_diagonal(S, base_u, t0, W, a.penalty)
    Cn = (E - E.min()) / max(np.median(E) - E.min(), 1e-9)
    op, _, n_terms, _ = qkb.cost_operator(Cn, n)
    qc, gam, bet = qkb.build_qaoa_circuit(op, n, a.p)
    bound = qkb._bind(qc, gam, bet, r["gamma"], r["beta"])
    bound.measure_all()                                           # classical register is named "meas"

    # ideal (noiseless) distribution, from the same Qiskit circuit
    from qiskit.quantum_info import Statevector
    nomeas = bound.remove_final_measurements(inplace=False)
    ideal = np.asarray(Statevector(nomeas).probabilities(), dtype=float)
    ground = int(np.argmin(E))
    print(f"[2/4] trained angles gamma={np.round(r['gamma'], 3).tolist()} beta={np.round(r['beta'], 3).tolist()}; "
          f"ideal ground-state probability {ideal[ground]:.3f} (uniform {1 / 2 ** n:.4f}); {n_terms} Pauli terms")

    if a.dry_run:
        from qiskit import transpile
        t = transpile(bound, basis_gates=qkb.BASIS, optimization_level=1)
        print(f"[dry-run] transpiled to {qkb.BASIS}: depth {t.depth()}, two-qubit gates {t.num_nonlocal_gates()}")
        return

    from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2
    from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
    service = QiskitRuntimeService()                              # uses the account saved with save_account()
    backend = service.backend(a.backend) if a.backend else service.least_busy(operational=True, simulator=False, min_num_qubits=n)
    print(f"[3/4] running on {backend.name} ({backend.num_qubits} qubits) ...")
    isa = generate_preset_pass_manager(optimization_level=3, backend=backend).run(bound)
    t_sub = time.time()
    job = SamplerV2(mode=backend).run([isa], shots=a.shots)
    print(f"      job id {job.job_id()}  (waiting in the device queue)")
    counts = job.result()[0].data.meas.get_counts()
    wall = time.time() - t_sub

    hw = np.zeros(1 << n)
    for bits, c in counts.items():
        hw[int(bits, 2)] = c
    hw /= hw.sum()
    tvd = float(0.5 * np.abs(hw - ideal).sum())
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:8]
    res = {
        "created": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "is_quantum_hardware": True,
        "backend": backend.name, "job_id": job.job_id(), "qubits": n, "p": a.p, "shots": a.shots,
        "window": {"start": t0, "hours": W}, "gamma": r["gamma"], "beta": r["beta"],
        "transpiled": {"depth": int(isa.depth()), "two_qubit_gates": int(isa.num_nonlocal_gates()),
                       "ops": {str(k): int(v) for k, v in isa.count_ops().items()}},
        "ideal": {"ground_state_probability": float(ideal[ground]), "expected_cost": float(ideal @ E)},
        "hardware": {"ground_state_probability": float(hw[ground]), "expected_cost": float(hw @ E),
                     "uniform_ground_probability": 1.0 / (1 << n),
                     "best_cost_seen": float(min(E[int(b, 2)] for b in counts)), "window_optimum_cost": float(E.min())},
        "total_variation_distance_vs_ideal": tvd,
        "top_outcomes": [{"bitstring": b, "count": int(c), "cost": float(E[int(b, 2)])} for b, c in top],
        "wall_time_s": round(wall, 1),
        "note": "Noisy hardware run of a short window. Not a claim of quantum advantage.",
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(res, f, indent=2)
    print(f"[4/4] hardware ground-state prob {hw[ground]:.3f} vs ideal {ideal[ground]:.3f} vs uniform {1 / 2 ** n:.4f}; "
          f"TVD vs ideal {tvd:.3f}\n      saved {os.path.abspath(a.out)}")


if __name__ == "__main__":
    main()
