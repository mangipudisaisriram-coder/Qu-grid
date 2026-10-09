import { Page } from '../components/ui';
import { useStore } from '../store';

export default function Settings() {
  const { user, logout, run, usingDemoRun } = useStore();
  return (
    <Page title="Settings" subtitle="Account and environment">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card text-sm"><div className="mb-2 font-medium text-white">Account</div>
          <div className="text-slate-300">{user?.name}</div><div className="text-slate-400">{user?.email}</div>
          {user?.demo && <p className="mt-2 text-xs text-amber-400">Demo mode: nothing is sent to a server and optimization replays bundled results.</p>}
          <button className="btn-ghost mt-3" onClick={logout}>Sign out</button></div>
        <div className="card text-sm"><div className="mb-2 font-medium text-white">Environment</div>
          <div className="text-slate-400">API base: <code>{(import.meta as any).env?.VITE_API_URL || '(same origin / Vite proxy → :8000)'}</code></div>
          <div className="text-slate-400">Results source: {usingDemoRun ? 'bundled demo run' : 'live backend run'}</div>
          <div className="text-slate-400">Quantum backend: {run.meta.quantum_backend}</div>
          <div className="text-slate-400">Quantum hardware used: {run.meta.is_quantum_hardware ? 'yes' : 'no'}</div></div>
      </div>
    </Page>
  );
}
