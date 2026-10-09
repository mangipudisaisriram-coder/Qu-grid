import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Heatmap, Page, Stat } from '../components/ui';
import { histogram, usd } from '../lib';
import { useStore } from '../store';

const tip = { contentStyle: { background: '#0f172a', border: '1px solid #1e293b' } };

export default function Results() {
  const { run, setHour, setView } = useStore();
  const [tab, setTab] = useState<'summary' | 'detailed'>('summary');
  const nav = useNavigate();
  const s = run.summary;
  const ids = run.system.generators.map((g) => g.id);
  const qKey = run.best_quantum;
  const qSched = (run as any)[qKey].schedule;
  const conv = run.annealing.convergence.map((c) => ({ sweep: c.iteration, Quantum: Math.round(c.cost), Classical: Math.round(s.classical_cost) }));
  const samples = [...run.annealing.samples, ...(run.qaoa?.samples ?? [])];
  const hist = histogram(samples.map((x) => x.cost), 10);
  const qk = run.qaoa?.qiskit;
  const peak = run.system.demand.indexOf(Math.max(...run.system.demand));
  const replay = (v: 'classical' | 'quantum') => { setView(v); setHour(peak); nav('/simulation'); };

  function exportCsv(which: 'classical' | 'quantum') {
    const sc = which === 'classical' ? run.classical.schedule : qSched;
    const rows = [['hour', 'demand_MW', ...ids.map((i) => `${i}_on`), ...ids.map((i) => `${i}_MW`)].join(',')];
    run.system.demand.forEach((d, t) => rows.push([t, d, ...sc.u.map((r: number[]) => r[t]), ...sc.P.map((r: number[]) => r[t])].join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = `schedule_${which}.csv`; a.click();
  }
  return (
    <Page title="Optimization Results" subtitle="Summary of quantum-assisted vs classical optimization"
      actions={<div className="flex rounded-lg border border-line p-1 text-sm">
        {(['summary', 'detailed'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 capitalize ${tab === t ? 'bg-brand text-white' : 'text-slate-300'}`}>{t}</button>)}
      </div>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Quantum-assisted cost" value={usd(s.quantum_cost)} sub={`via ${qKey === 'qaoa' ? 'annealing + QAOA' : 'annealing'}`} />
        <Stat label="Classical (MILP) cost" value={usd(s.classical_cost)} sub="reference optimum" />
        <Stat label="Optimality gap" value={`${s.gap_pct.toFixed(2)}%`} tone={s.gap_pct < 5 ? 'text-emerald-400' : 'text-amber-400'} sub="(Cq − Cc) / Cc" />
        <Stat label="Feasible solutions" value={`${s.feasible_pct.toFixed(0)}%`} sub="after repair + dispatch" />
        <Stat label="Iterations" value={s.iterations} sub={`${s.circuit_evaluations} circuit evals`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="mb-2 text-sm font-medium text-white">Cost convergence (best sample per sweep checkpoint)</div>
          <div className="h-60"><ResponsiveContainer><LineChart data={conv}>
            <CartesianGrid stroke="#1e293b" /><XAxis dataKey="sweep" stroke="#64748b" /><YAxis stroke="#64748b" domain={['auto', 'auto']} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip {...tip} formatter={(v: any) => usd(v)} /><Legend />
            <Line dataKey="Quantum" stroke="#3b82f6" dot={false} strokeWidth={2} /><Line dataKey="Classical" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
          </LineChart></ResponsiveContainer></div>
        </div>
        <div className="card">
          <div className="mb-2 text-sm font-medium text-white">Solution distribution ({samples.length} samples)</div>
          <div className="h-60"><ResponsiveContainer><BarChart data={hist}>
            <CartesianGrid stroke="#1e293b" /><XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} /><YAxis stroke="#64748b" allowDecimals={false} />
            <Tooltip {...tip} /><Bar dataKey="count" fill="#3b82f6" />
          </BarChart></ResponsiveContainer></div>
        </div>
        <div className="card"><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-white">Quantum-assisted schedule</span><button className="text-cyanx" onClick={() => replay('quantum')}>Replay in 3D →</button></div>
          <Heatmap u={qSched.u} ids={ids} onPick={(h) => { setView('quantum'); setHour(h); nav('/simulation'); }} /></div>
        <div className="card"><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-white">Classical (MILP) schedule</span><button className="text-cyanx" onClick={() => replay('classical')}>Replay in 3D →</button></div>
          <Heatmap u={run.classical.schedule.u} ids={ids} onPick={(h) => { setView('classical'); setHour(h); nav('/simulation'); }} /></div>
      </div>

      {tab === 'detailed' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card text-sm">
            <div className="mb-2 font-medium text-white">Algorithm metrics</div>
            <dl className="grid grid-cols-2 gap-y-1 text-slate-300">
              <dt className="text-slate-400">QUBO variables</dt><dd>{s.qubo_variables} ({run.annealing.qubo.commitment_bits} commitment + {run.annealing.qubo.slack_bits} slack)</dd>
              <dt className="text-slate-400">Annealing</dt><dd>{run.annealing.reads} reads × {run.annealing.sweeps} sweeps · {run.annealing.time_s}s</dd>
              {run.qaoa && <>
                <dt className="text-slate-400">QAOA qubits / depth p</dt><dd>{run.qaoa.qubits} / {run.qaoa.p} (est. circuit depth {run.qaoa.depth_estimate})</dd>
                <dt className="text-slate-400">QAOA window</dt><dd>hours {run.qaoa.window.start}–{run.qaoa.window.start + run.qaoa.window.hours - 1}</dd>
                <dt className="text-slate-400">Ground-state probability</dt><dd>{(run.qaoa.ground_state_probability * 100).toFixed(1)}% (uniform: {(run.qaoa.uniform_ground_probability * 100).toFixed(4)}%)</dd>
                <dt className="text-slate-400">Circuit evaluations</dt><dd>{run.qaoa.circuit_evaluations}</dd>
              </>}
              <dt className="text-slate-400">Max load-balance error</dt><dd>{s.max_load_error.toExponential(1)} MW</dd>
              <dt className="text-slate-400">Reserve violation</dt><dd>{s.reserve_violation.toFixed(1)} MW</dd>
              <dt className="text-slate-400">Runtime</dt><dd>{s.runtime_s}s</dd>
              <dt className="text-slate-400">Backend</dt><dd>{run.meta.quantum_backend}</dd>
            </dl>
            <div className="mt-3 flex gap-2"><button className="btn-ghost" onClick={() => exportCsv('quantum')}>Export quantum CSV</button><button className="btn-ghost" onClick={() => exportCsv('classical')}>Export classical CSV</button></div>
          </div>
          <div className="card text-sm">
            <div className="mb-2 font-medium text-white">Robustness tests</div>
            {run.robustness?.length ? (
              <table className="w-full"><thead className="text-left text-xs text-slate-400"><tr><th>Scenario</th><th>Classical</th><th>Quantum</th><th>Gap</th></tr></thead>
                <tbody>{run.robustness.map((r) => (
                  <tr key={r.scenario} className="border-t border-line"><td className="py-1">{r.scenario}</td>
                    {r.status === 'OK' ? <><td>{usd(r.classical!)}</td><td>{r.quantum ? usd(r.quantum) : '—'}</td><td>{r.gap_pct != null ? `${r.gap_pct.toFixed(1)}%` : '—'}</td></>
                      : <td colSpan={3} className="text-amber-400">{r.status === 'Infeasible' ? 'Infeasible: capacity cannot meet demand + reserve' : r.status}</td>}</tr>))}</tbody></table>
            ) : <p className="text-slate-400">Run the optimization to generate robustness scenarios.</p>}
            <p className="mt-3 text-xs text-slate-500">Scenarios use annealing only (24 reads × 150 sweeps). Min up/down time is enforced by repair, not inside the QUBO.</p>
          </div>
          <div className="card text-sm lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-medium text-white">
              <span>Qiskit circuit check</span>
              {qk?.available && !qk.error && <span className={`rounded-full px-2 py-0.5 text-xs ${qk.cross_validation?.passed ? 'bg-emerald-950 text-emerald-300' : 'bg-amber-950 text-amber-300'}`}>
                {qk.cross_validation?.passed ? '✓ matches NumPy simulator' : 'differs from NumPy simulator'}</span>}
            </div>
            {!run.qaoa ? <p className="text-slate-400">Run the hybrid solver to build the QAOA circuit.</p>
              : !qk ? <p className="text-slate-400">This run has no Qiskit data (older or demo run). Install <code>qiskit</code> on the backend and run the hybrid solver again.</p>
              : !qk.available ? <p className="text-slate-400">{qk.reason ?? 'Qiskit was not used for this run.'}</p>
              : qk.error ? <p className="text-amber-400">Qiskit check failed: {qk.error}</p>
              : <div className="grid gap-4 md:grid-cols-2">
                <dl className="grid grid-cols-2 gap-y-1 text-slate-300">
                  <dt className="text-slate-400">Qiskit version</dt><dd>{qk.version} ({qk.simulator})</dd>
                  <dt className="text-slate-400">Training engine</dt><dd>{run.qaoa.engine ?? 'numpy'}{run.qaoa.engine_note ? ` — ${run.qaoa.engine_note}` : ''}</dd>
                  <dt className="text-slate-400">Cost operator</dt><dd>{qk.pauli_terms} Pauli-Z terms (max weight {qk.max_pauli_weight})</dd>
                  <dt className="text-slate-400">Transpiled ({qk.transpiled?.basis_gates.join(', ')})</dt><dd>depth {qk.transpiled?.depth} · {qk.transpiled?.two_qubit_gates} CX · {qk.transpiled?.size} gates</dd>
                  <dt className="text-slate-400">State fidelity vs NumPy</dt><dd>{qk.cross_validation?.fidelity.toFixed(12)}</dd>
                  <dt className="text-slate-400">Ground-state probability</dt><dd>{((qk.ground_state_probability ?? 0) * 100).toFixed(1)}%</dd>
                </dl>
                <div>
                  <div className="mb-1 text-xs text-slate-400">Most frequent measurement outcomes ({run.qaoa.shots} shots, sampled with Qiskit)</div>
                  <table className="w-full text-xs"><thead className="text-left text-slate-400"><tr><th>Bitstring</th><th>Counts</th><th>Window cost</th></tr></thead>
                    <tbody>{qk.top_outcomes?.map((o) => (
                      <tr key={o.state} className="border-t border-line"><td className="py-0.5 font-mono">{o.bitstring}{o.is_ground ? ' ★' : ''}</td><td>{o.count}</td><td>{usd(o.cost)}</td></tr>))}</tbody></table>
                  <div className="mt-1 text-[10px] text-slate-500">★ = optimal state of the window. Simulation only — no quantum hardware.</div>
                </div>
              </div>}
          </div>
        </div>)}
    </Page>
  );
}
