import { Link } from 'react-router-dom';
import { Page } from '../components/ui';
import { useStore } from '../store';

export default function Optimization() {
  const { config, setConfig, system, setSystem, runOptimization, runState, user, run } = useStore();
  const num = (k: any, v: string, lo: number, hi: number) => setConfig({ [k]: Math.min(hi, Math.max(lo, Number(v) || lo)) } as any);
  const running = runState.status === 'running';
  const qaoa = config.solver === 'qaoa';
  return (
    <Page title="Optimization" subtitle="Configure the hybrid solver and run it">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Reserve margin (%)</label>
              <input className="input" type="number" min={0} max={30} value={system.reserve_pct} onChange={(e) => setSystem({ ...system, reserve_pct: Math.min(30, Math.max(0, Number(e.target.value) || 0)) })} /></div>
            <div><label className="label">Time horizon (hours, 6–24)</label>
              <input className="input" type="number" min={6} max={24} value={config.horizon} onChange={(e) => num('horizon', e.target.value, 6, 24)} /></div>
            <div className="sm:col-span-2"><label className="label">Solver</label>
              <select className="input" value={config.solver} onChange={(e) => setConfig({ solver: e.target.value as any })}>
                <option value="qaoa">Hybrid: simulated annealing + QAOA simulator</option>
                <option value="annealing">Simulated annealing only (quantum-annealing baseline)</option>
                <option disabled>Quantum annealer (D-Wave) — requires hardware access</option>
              </select></div>
            <div><label className="label">Penalty weight λ ($/MW²)</label><input className="input" type="number" step="0.5" value={config.penalty} onChange={(e) => num('penalty', e.target.value, 0.5, 100)} /></div>
            <div><label className="label">Annealing reads × sweeps</label>
              <div className="flex gap-2"><input className="input" type="number" value={config.reads} onChange={(e) => num('reads', e.target.value, 4, 200)} /><input className="input" type="number" value={config.sweeps} onChange={(e) => num('sweeps', e.target.value, 20, 1000)} /></div></div>
            {qaoa && <>
              <div><label className="label">QAOA depth p</label><input className="input" type="number" min={1} max={4} value={config.qaoa_p} onChange={(e) => num('qaoa_p', e.target.value, 1, 4)} /></div>
              <div><label className="label">QAOA shots</label><input className="input" type="number" step={256} value={config.qaoa_shots} onChange={(e) => num('qaoa_shots', e.target.value, 128, 8192)} /></div>
              <div className="sm:col-span-2"><label className="label">QAOA training engine</label>
                <select className="input" value={config.qaoa_engine ?? 'numpy'} onChange={(e) => setConfig({ qaoa_engine: e.target.value as any })}>
                  <option value="numpy">NumPy simulator (fast) — final circuit is always verified in Qiskit when installed</option>
                  <option value="qiskit">Qiskit circuit simulation (slower, 90 s budget; needs the qiskit package)</option>
                </select></div>
            </>}
          </div>
          <button className="btn-primary w-full" disabled={running} onClick={runOptimization}>{running ? 'Running…' : '▶ Run Optimization'}</button>
          {(running || runState.status === 'done') && (
            <div>
              <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full bg-cyanx transition-all" style={{ width: `${Math.round(runState.progress * 100)}%` }} /></div>
              <div className="mt-1 text-xs text-slate-400">{Math.round(runState.progress * 100)}% · {runState.message}</div>
            </div>)}
          {runState.status === 'error' && <div role="alert" className="rounded-lg bg-rose-950/40 p-3 text-sm text-rose-300">{runState.error}</div>}
          {runState.status === 'done' && <Link to="/results" className="btn-ghost">View results →</Link>}
        </div>
        <div className="card text-sm text-slate-300">
          <div className="mb-2 font-medium text-white">How it works</div>
          <ol className="list-decimal space-y-2 pl-5 text-slate-400">
            <li>HiGHS solves the full MILP (u, y, z binary) as the baseline.</li>
            <li>Commitment bits become a QUBO (cost + start-up + reserve penalty).</li>
            <li>Simulated annealing samples schedules; QAOA re-optimises the peak window on a simulator.</li>
            <li>Each sample is repaired, economically dispatched and checked against all constraints.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">No quantum hardware is used. {user?.demo ? 'Demo mode replays pre-computed results.' : ''}</p>
          <p className="mt-2 text-xs text-slate-500">Last run: {run.meta.created.slice(0, 19).replace('T', ' ')} UTC</p>
        </div>
      </div>
    </Page>
  );
}
