import { useState } from 'react';
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Logo } from './ui';

const NAV = [
  ['/dashboard', 'Dashboard', '▦'], ['/generators', 'Generators', '⚙'], ['/demand', 'Demand & Load', '⌁'],
  ['/optimization', 'Optimization', '✦'], ['/results', 'Results', '▤'], ['/simulation', 'Simulation', '◉'], ['/settings', 'Settings', '☰'],
];

export default function Shell() {
  const { user, logout, run, usingDemoRun } = useStore();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!user) return <Navigate to="/login" replace />;
  const side = (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-panel p-4">
      <div className="mb-6"><Logo /></div>
      <nav className="flex-1 space-y-1">
        {NAV.map(([to, label, icon]) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand text-white' : 'text-slate-300 hover:bg-line'}`}>
            <span className="w-4 text-center">{icon}</span>{label}
          </NavLink>
        ))}
      </nav>
      <div className="rounded-lg bg-navy p-3 text-xs text-slate-400">
        <div className="mb-1 font-medium text-slate-200">System Status</div>
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" />{usingDemoRun ? 'Demo data' : 'Live run'}</div>
        <div className="mt-1">Last run: {new Date(run.meta.created).toLocaleString()}</div>
      </div>
    </aside>
  );
  return (
    <div className="flex h-full bg-navy">
      <div className="hidden md:block">{side}</div>
      {open && <div className="fixed inset-0 z-40 flex md:hidden"><div>{side}</div><div className="flex-1 bg-black/60" onClick={() => setOpen(false)} /></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <button className="btn-ghost md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>☰</button>
          <div className="hidden text-xs text-slate-500 md:block">Simulated research testbed — no quantum hardware or live grid is controlled.</div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">{user.name}</span>
            <button className="btn-ghost" onClick={() => { logout(); nav('/'); }}>Sign out</button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
