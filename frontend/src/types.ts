export interface Generator {
  id: string; name: string; pmin: number; pmax: number; a: number; b: number; c: number;
  startup: number; shutdown: number; ramp: number; min_up: number; min_down: number; initial_on: number;
}
export interface System { generators: Generator[]; demand: number[]; reserve_pct: number }
export interface Sched { u: number[][]; P: number[][] }
export interface Metrics {
  cost: number; fuel_cost: number; noload_cost: number; startup_cost: number; shutdown_cost: number; num_startups: number;
  max_balance_error: number; reserve_violation: number; ramp_violation: number; limit_violation: number;
  updown_violations: number; feasible: boolean;
}
export interface Sample { cost: number; feasible: boolean; repaired: boolean; energy: number; count?: number }
export interface QiskitCheck {
  available: boolean | null; reason?: string; error?: string; version?: string; simulator?: string;
  pauli_terms?: number; max_pauli_weight?: number;
  transpiled?: { basis_gates: string[]; depth: number; size: number; two_qubit_gates: number; ops: Record<string, number> };
  cross_validation?: { total_variation_distance: number; fidelity: number; passed: boolean };
  expected_cost?: number; ground_state_probability?: number; time_s?: number;
  top_outcomes?: { state: number; bitstring: string; count: number; cost: number; is_ground: boolean }[];
}
export interface RunResult {
  meta: any; system: System;
  classical: { schedule: Sched; metrics: Metrics; solver: any };
  annealing: { schedule: Sched; metrics: Metrics; samples: Sample[]; convergence: any[]; qubo: any; reads: number; sweeps: number; time_s: number; iterations: number };
  qaoa: null | { schedule: Sched | null; metrics: Metrics | null; samples: Sample[]; convergence: { iteration: number; expected_cost: number }[];
    window: { start: number; hours: number }; qubits: number; p: number; shots: number; depth_estimate: number; zz_terms: number;
    ground_state_probability: number; uniform_ground_probability: number; circuit_evaluations: number; expected_cost: number;
    window_optimum_cost: number; window_mean_cost: number; time_s: number; hybrid: string;
    engine?: 'numpy' | 'qiskit'; engine_note?: string | null; qiskit?: QiskitCheck };
  best_quantum: 'annealing' | 'qaoa';
  summary: { classical_cost: number; quantum_cost: number; gap_pct: number; feasible_pct: number; iterations: number;
    circuit_evaluations: number; qubits: number | null; circuit_depth: number | null; qubo_variables: number;
    max_load_error: number; reserve_violation: number; runtime_s: number };
  robustness?: { scenario: string; status: string; classical: number | null; quantum: number | null; gap_pct: number | null; feasible: boolean }[];
}
export type SolverView = 'classical' | 'quantum';
export interface Config {
  solver: 'annealing' | 'qaoa'; horizon: number; reads: number; sweeps: number; penalty: number;
  qaoa_p: number; qaoa_shots: number; qaoa_engine?: 'numpy' | 'qiskit';
}
