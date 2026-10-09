import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import GridScene3D from '../components/GridScene3D';
import { Heatmap, Page } from '../components/ui';
import { useGrid } from '../hooks';
import { COLORS, usd } from '../lib';
import { useStore } from '../store';

export default function Simulation() {
  const g = useGrid();
  const { setHour, playing, setPlaying, view, setView, toggleUnit, clearEdits, edits } = useStore();
  const [tab, setTab] = useState<'3d' | 'schematic'>('3d');
  const ids = g.gens.map((x) => x.id);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setHour((useStore.getState().hour + 1) % g.T), 1200);
    return () => clearInterval(id);
  }, [playing, g.T, setHour]);
  const tone = g.status === 'Feasible' ? 'text-emerald-400' : g.status === 'Low reserve' ? 'text-amber-400' : 'text-rose-400';
  const freq = (50 - Math.max(-0.5, Math.min(0.5, (-g.shortfall / Math.max(g.demand[g.hour], 1)) * 5))).toFixed(2);
  const mix = g.gens.map((x, i) => ({ name: x.id, value: Math.round(g.P[i]), color: COLORS[i % COLORS.length] })).filter((d) => d.value > 0);

  return (
    <Page title="Live Grid View" subtitle="Simulated schedule playback — click a generator in 3D to switch it for this hour and see the effect"
      actions={<div className="flex flex-wrap gap-2">
        <select className="input w-auto" value={view} onChange={(e) => setView(e.target.value as any)} aria-label="Schedule source">
          <option value="quantum">Quantum-assisted</option><option value="classical">Classical MILP</option></select>
        <div className="flex rounded-lg border border-line p-1 text-sm">{(['3d', 'schematic'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-brand text-white' : 'text-slate-300'}`}>{t === '3d' ? '3D' : 'Schematic'}</button>)}</div>
      </div>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="card relative h-[420px] overflow-hidden p-0">
            {tab === '3d'
              ? <GridScene3D className="h-full" gens={g.gens} on={g.on} P={g.P} demandFrac={g.demandFrac} onToggle={(i) => toggleUnit(i, g.on[i])} />
              : <Schematic g={g} />}
            <div className="pointer-events-none absolute left-3 top-3 w-52 rounded-lg border border-line bg-panel/90 p-3 text-xs">
              <div className="mb-1 font-semibold text-cyanx">Grid Overview · {String(g.hour).padStart(2, '0')}:00</div>
              <div className="flex justify-between"><span>Total Generation</span><b>{Math.round(g.gen)} MW</b></div>
              <div className="flex justify-between"><span>Total Demand</span><b>{Math.round(g.demand[g.hour])} MW</b></div>
              <div className="flex justify-between"><span>Reserve Margin</span><b>{g.reservePct.toFixed(1)}%</b></div>
              <div className="flex justify-between"><span>Hour cost</span><b>{usd(g.cost)}</b></div>
              <div className={`mt-1 font-semibold ${tone}`}>● {g.status}{g.edited ? ' (edited)' : ''}</div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <button className="btn-ghost w-24" onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
              <input aria-label="Hour" className="flex-1" type="range" min={0} max={g.T - 1} value={g.hour} onChange={(e) => setHour(+e.target.value)} />
              <button className="btn-ghost" disabled={!Object.keys(edits).length} onClick={clearEdits}>Reset edits</button>
            </div>
            <div className="mt-3"><Heatmap u={g.sched.u} ids={ids} hour={g.hour} onPick={setHour} compact /></div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <div className="mb-1 text-sm font-medium text-white">Generation Mix</div>
            <div className="relative h-48">
              <ResponsiveContainer><PieChart><Pie data={mix} dataKey="value" innerRadius={50} outerRadius={75} stroke="none">{mix.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} formatter={(v: any) => `${v} MW`} /></PieChart></ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><div className="text-lg font-semibold text-white">{Math.round(g.gen)} MW</div><div className="text-[10px] text-slate-400">Total</div></div>
            </div>
            <ul className="mt-1 grid grid-cols-2 gap-1 text-xs">{g.gens.map((x, i) => <li key={x.id} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{x.id} {Math.round(g.P[i])} MW {g.gen > 0 ? `(${((g.P[i] / g.gen) * 100).toFixed(1)}%)` : ''}</li>)}</ul>
          </div>
          <div className="card text-sm">
            <div className="mb-2 font-medium text-white">Live Metrics <span className="text-[10px] font-normal text-slate-500">(simulated)</span></div>
            <div className="flex justify-between py-1"><span className="text-slate-400">Frequency</span><b>{freq} Hz</b></div>
            <div className="flex justify-between py-1"><span className="text-slate-400">Voltage (nominal)</span><b>230 kV</b></div>
            <div className="flex justify-between py-1"><span className="text-slate-400">Committed capacity</span><b>{g.cap} MW</b></div>
            <div className="flex justify-between py-1"><span className="text-slate-400">Grid status</span><b className={tone}>{g.status === 'Feasible' ? 'Normal' : g.status}</b></div>
            {g.shortfall > 1 && <p className="mt-2 text-xs text-rose-300">Shortfall of {Math.round(g.shortfall)} MW — turn on another unit.</p>}
          </div>
        </div>
      </div>
    </Page>
  );
}

function Schematic({ g }: { g: ReturnType<typeof useGrid> }) {
  const n = g.gens.length, H = 420, W = 760;
  const y = (i: number) => 50 + (i * (H - 100)) / Math.max(1, n - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Single-line diagram">
      {g.gens.map((x, i) => (
        <g key={x.id}>
          <line x1={150} y1={y(i)} x2={380} y2={H / 2} stroke={g.on[i] ? COLORS[i % COLORS.length] : '#334155'} strokeWidth={1 + (g.P[i] / 250) * 8} strokeDasharray={g.on[i] ? '' : '4 4'} />
          <circle cx={120} cy={y(i)} r={26} fill="#0f172a" stroke={g.on[i] ? COLORS[i % COLORS.length] : '#475569'} strokeWidth={3} />
          <text x={120} y={y(i) + 4} textAnchor="middle" fill="#e2e8f0" fontSize={13}>{x.id}</text>
          <text x={20} y={y(i) + 4} fill={g.on[i] ? '#34d399' : '#fb7185'} fontSize={12}>{g.on[i] ? `${Math.round(g.P[i])} MW` : 'OFF'}</text>
        </g>))}
      <rect x={370} y={H / 2 - 40} width={20} height={80} fill="#38bdf8" rx={4} />
      <line x1={390} y1={H / 2} x2={600} y2={H / 2} stroke="#fde047" strokeWidth={2 + (g.gen / 800) * 10} />
      <rect x={600} y={H / 2 - 50} width={110} height={100} rx={10} fill="#1f2937" stroke="#fde047" />
      <text x={655} y={H / 2 - 6} textAnchor="middle" fill="#fde047" fontSize={14}>City load</text>
      <text x={655} y={H / 2 + 16} textAnchor="middle" fill="#e2e8f0" fontSize={14}>{Math.round(g.demand[g.hour])} MW</text>
    </svg>
  );
}
