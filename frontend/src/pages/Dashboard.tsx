import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page, Stat } from '../components/ui';
import { useGrid } from '../hooks';
import { useStore } from '../store';
import { mw, usd } from '../lib';
const GridScene3D = lazy(() => import('../components/GridScene3D'));

export default function Dashboard() {
  const g = useGrid();
  const { user, setHour, view, setView } = useStore();
  const day = g.run.summary;
  const dayCost = view === 'classical' ? day.classical_cost : day.quantum_cost;
  const diff = ((day.quantum_cost - day.classical_cost) / day.classical_cost) * 100;
  const data = g.demand.map((d, t) => ({ hour: t, Demand: d, Generation: Math.round(g.hourlyGen[t]), Capacity: g.hourlyCap[t] }));
  return (
    <Page title={`Hello, ${user?.name ?? 'Student'}`} subtitle="Here's your power system overview"
      actions={
        <div className="flex gap-2">
          <select className="input w-auto" value={view} onChange={(e) => setView(e.target.value as any)} aria-label="Schedule source">
            <option value="quantum">Quantum-assisted schedule</option><option value="classical">Classical MILP schedule</option>
          </select>
          <select className="input w-auto" value={g.hour} onChange={(e) => setHour(+e.target.value)} aria-label="Hour">
            {g.demand.map((_, t) => <option key={t} value={t}>Hour {String(t).padStart(2, '0')}:00</option>)}
          </select>
        </div>}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Generation" value={mw(g.gen)} sub={g.status === 'Feasible' ? '✓ Balanced with demand' : g.status} tone={g.status === 'Feasible' ? 'text-emerald-400' : 'text-amber-400'} />
        <Stat label="Total Demand" value={mw(g.demand[g.hour])} sub={`Peak ${mw(Math.max(...g.demand))}`} />
        <Stat label="Total Cost (24 h)" value={usd(dayCost)} sub={view === 'quantum' ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% vs classical` : 'Optimal baseline'} tone={view === 'quantum' && diff > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <Stat label="Reserve Margin" value={`${g.reservePct.toFixed(1)}%`} sub={g.reservePct >= g.run.system.reserve_pct ? '✓ Meets requirement' : 'Below requirement'} tone={g.reservePct >= g.run.system.reserve_pct ? 'text-emerald-400' : 'text-rose-400'} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-2 text-sm font-medium text-white">Demand vs. Total Generation (MW)</div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={data}>
                <CartesianGrid stroke="#1e293b" /><XAxis dataKey="hour" stroke="#64748b" /><YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                <Area dataKey="Generation" stroke="#34d399" fill="#34d399" fillOpacity={0.25} />
                <Area dataKey="Demand" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15} />
                <Line dataKey="Capacity" stroke="#64748b" strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="mb-2 text-sm font-medium text-white">Generator Status · {String(g.hour).padStart(2, '0')}:00</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-400"><tr><th>Generator</th><th>Status</th><th className="text-right">Output</th></tr></thead>
            <tbody>
              {g.gens.map((x, i) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="py-2">{x.id}</td>
                  <td><span className={`mr-2 inline-block h-2 w-2 rounded-full ${g.on[i] ? 'bg-emerald-400' : 'bg-rose-400'}`} />{g.on[i] ? 'ON' : 'OFF'}</td>
                  <td className="text-right">{Math.round(g.P[i])} MW</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </div>
      <Link to="/simulation" className="card group mt-4 block overflow-hidden p-0">
        <div className="flex items-center justify-between px-4 pt-3 text-sm"><span className="font-medium text-white">Grid snapshot</span><span className="text-cyanx group-hover:underline">Open full 3D simulation →</span></div>
        <Suspense fallback={<div className="h-56" />}>
          <GridScene3D className="h-56" interactive={false} gens={g.gens} on={g.on} P={g.P} demandFrac={g.demandFrac} />
        </Suspense>
      </Link>
    </Page>
  );
}
