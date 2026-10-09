# QuantumUC — Quantum-Assisted Unit Commitment & Load Balancing

Hybrid quantum-classical scheduler for a small thermal power system (5 units × 24 h), with a React UI and an
interactive 3D grid. **No quantum hardware is used in the app**: QAOA runs on simulators (a fast NumPy statevector simulator, cross-validated
against a **Qiskit** circuit) and the "quantum annealing" baseline is classical simulated annealing. Every result says so.
An optional script runs a short window on **real IBM Quantum hardware** (see below).

## Pipeline (backend/uc)
| Step | File | What it does |
|---|---|---|
| Model | `models.py` | Generators (Pmin/Pmax, a,b,c, start-up/shut-down, ramp, min up/down), demand, reserve % |
| Classical baseline | `classical.py` | MILP with u, y, z binary; PWL fuel curve; balance, reserve, ramp, min up/down, u_t−u_{t−1}=y_t−z_t (HiGHS via SciPy) |
| QUBO | `qubo.py` | Binary commitment variables only (Option B). Per-unit-hour Lagrangian cost, exact start-up/shut-down terms, reserve penalty with slack bits |
| Annealing | `annealing.py` | Vectorised parallel simulated annealing on the QUBO |
| QAOA | `qaoa.py` | QAOA (COBYLA) on a 15-qubit window (3 h × 5 units) around the demand peak; trained with NumPy (default) or Qiskit |
| Qiskit bridge | `qiskit_bridge.py` | Exact Pauli-Z decomposition of the cost Hamiltonian, QAOA circuit via `PauliEvolutionGate`, simulation + sampling, transpilation, cross-validation |
| Dispatch | `dispatch.py` | Economic dispatch for a fixed commitment (LP, ramping enforced) |
| Check/repair | `evaluate.py` | Cost, balance, reserve, ramp, min up/down; greedy repair of samples |
| Orchestration | `pipeline.py` | Runs everything, builds convergence, histogram, robustness tests, summary |

Known simplifications (also shown in the UI): min up/down time is enforced by repair, not in the QUBO (it would
need cubic terms); QAOA only optimises a short window because 120+ qubits cannot be simulated; the
default system uses b and c coefficients ×10/×≈14 vs. the UI mock-up so the commitment trade-off is non-trivial.

## Run
```bash
# backend (Python 3.10+)
cd backend && pip install -r requirements.txt
python scripts/make_demo.py            # optional: regenerate the bundled demo run
uvicorn app.main:app --reload --port 8000
# tests (no network/FastAPI needed for the core)
python tests/test_uc.py                # or: pip install -r requirements-dev.txt && pytest tests

# frontend (Node 18+)
cd frontend && npm install && npm run dev      # http://localhost:5173
```
Or `docker compose up --build`. Without a backend, choose **Continue in demo mode** on the login page: the UI works
fully with a bundled, pre-computed run.

## Qiskit integration
The QAOA cost Hamiltonian is diagonal, so it is rewritten **exactly** as a sum of Pauli-Z strings (Walsh–Hadamard transform;
103 terms for the default 15-qubit window, reconstruction error ~1e-15). The circuit is then built with Qiskit:

`|+⟩^n → [ PauliEvolutionGate(H_C, γ_l) → RX(2β_l) on every qubit ] × p`

* **Verification (default, whenever `qiskit` is installed):** after training, the circuit is rebuilt in Qiskit with the trained
  angles, simulated (`Statevector`), sampled, and transpiled to `{rz, sx, x, cx}`. The Results page shows gate counts, depth and the
  fidelity against the NumPy simulator (should be 1.000000000000).
* **Qiskit training (opt-in):** choose *QAOA training engine → Qiskit* on the Optimization page (`qaoa_engine: "qiskit"`); every
  COBYLA evaluation then simulates the Qiskit circuit (90 s budget, automatic fallback to NumPy).
* **Without Qiskit** the app works exactly as before; the Results card says Qiskit was not used.
* **Real hardware (optional):** `python scripts/run_on_ibm_quantum.py --dry-run`, then with an IBM Quantum API key
  `python scripts/run_on_ibm_quantum.py --hours 1 --shots 4000` runs a 5-qubit window on the least-busy device and writes
  `data/ibm_hardware_run.json` (hardware vs ideal distribution, total-variation distance). Noisy devices degrade the result;
  this is a reproducible end-to-end run, not a claim of quantum advantage.

## Screens
Landing (3D hero) · Login/Sign-up · Dashboard · Generators (editable table) · Demand & Load (CSV upload) ·
Optimization (run + progress) · Results (Summary/Detailed, convergence, heatmaps, histogram, robustness, CSV export) ·
Simulation (3D + schematic, hour slider/play, click a generator to toggle it and see dispatch/reserve/cost update).

## API
`POST /api/auth/register|login` · `GET/PUT /api/system` · `POST /api/runs` → `GET /api/runs/{id}` (progress, result) ·
`GET /api/runs/{id}/export` (CSV) · `GET /api/demo` · `GET /api/health`.
Set `QUANTUMUC_SECRET` in production. Google sign-in returns 501 until you add an OAuth client.

## Roadmap
Renewables/storage, DC power flow, warm-start QAOA, ADMM decomposition, min up/down inside the QUBO.
