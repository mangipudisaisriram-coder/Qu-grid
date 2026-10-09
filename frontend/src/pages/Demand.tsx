import { ChangeEvent, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page, Stat } from '../components/ui';
import { parseDemandCsv, mw } from '../lib';
import { useStore } from '../store';

const PRESET = [320, 300, 285, 280, 290, 340, 430, 540, 630, 690, 710, 720, 710, 690, 670, 675, 700, 720, 720, 680, 600, 500, 410, 350];

export default function Demand() {
  const { system, setSystem } = useStore();
  const [msg, setMsg] = useState('');
  const cap = system.generators.reduce((s, g) => s + g.pmax, 0);
  const need = Math.max(...system.demand) * (1 + system.reserve_pct / 100);
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const d = parseDemandCsv(await f.text());
    if (d.length < 4) return setMsg('Need at least 4 numeric demand values (one per hour; optional “hour,MW” columns).');
    setSystem({ ...system, demand: d }); setMsg(`Loaded ${d.length} hourly values.`);
  }
  return (
    <Page title="Demand & Load" subtitle="24-hour demand profile used by every solver"
      actions={<div className="flex gap-2">
        <label className="btn-ghost cursor-pointer">⇪ Upload CSV<input type="file" accept=".csv,.txt" className="hidden" onChange={upload} /></label>
        <button className="btn-ghost" onClick={() => { setSystem({ ...system, demand: PRESET }); setMsg('Default profile restored.'); }}>Default profile</button>
      </div>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Peak demand" value={mw(Math.max(...system.demand))} />
        <Stat label="Energy (24 h)" value={`${Math.round(system.demand.reduce((a, b) => a + b, 0)).toLocaleString()} MWh`} />
        <Stat label="Capacity check" value={cap >= need ? 'OK' : 'Insufficient'} sub={`Installed ${mw(cap)} vs needed ${mw(need)} at peak incl. reserve`} tone={cap >= need ? 'text-emerald-400' : 'text-rose-400'} />
      </div>
      <div className="card mt-4">
        <div className="h-72">
          <ResponsiveContainer><AreaChart data={system.demand.map((d, t) => ({ hour: t, MW: d }))}>
            <CartesianGrid stroke="#1e293b" /><XAxis dataKey="hour" stroke="#64748b" /><YAxis stroke="#64748b" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
            <Area dataKey="MW" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} />
          </AreaChart></ResponsiveContainer>
        </div>
        <div className="mt-2 text-xs text-slate-400">{msg}</div>
      </div>
      {cap < need && <p role="alert" className="mt-3 rounded-lg bg-rose-950/40 p-3 text-xs text-rose-300">Installed capacity cannot cover peak demand plus the reserve margin, so the optimization will be reported infeasible.</p>}
    </Page>
  );
}
