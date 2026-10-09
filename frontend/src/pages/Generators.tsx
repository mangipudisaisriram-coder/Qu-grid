import { useState } from 'react';
import { Page } from '../components/ui';
import { useStore } from '../store';
import { Generator } from '../types';

const COLS: [keyof Generator, string, number][] = [
  ['pmin', 'Pmin (MW)', 1], ['pmax', 'Pmax (MW)', 1], ['a', 'a ($/MW²h)', 0.001], ['b', 'b ($/MWh)', 0.1], ['c', 'c ($/h)', 10],
  ['startup', 'Startup ($)', 100], ['shutdown', 'Shutdown ($)', 100], ['ramp', 'Ramp (MW/h)', 1], ['min_up', 'Min up (h)', 1], ['min_down', 'Min down (h)', 1],
];

export function validate(gens: Generator[]): string[] {
  const e: string[] = [];
  if (gens.length < 1 || gens.length > 8) e.push('Use between 1 and 8 generators.');
  gens.forEach((g) => {
    if (!(g.pmax > g.pmin && g.pmin >= 0)) e.push(`${g.id}: Pmax must be greater than Pmin ≥ 0.`);
    if (g.a < 0 || g.b < 0 || g.c < 0) e.push(`${g.id}: cost coefficients must be ≥ 0.`);
    if (g.ramp <= 0 || g.min_up < 1 || g.min_down < 1) e.push(`${g.id}: ramp > 0 and min up/down ≥ 1.`);
  });
  if (new Set(gens.map((g) => g.id)).size !== gens.length) e.push('Generator IDs must be unique.');
  return e;
}

export default function Generators() {
  const { system, setSystem, saveSystem, user } = useStore();
  const [rows, setRows] = useState<Generator[]>(system.generators);
  const [msg, setMsg] = useState('');
  const errs = validate(rows);
  const upd = (i: number, k: keyof Generator, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: k === 'name' || k === 'id' ? v : Number(v) } : r)));
  const add = () => rows.length < 8 && setRows([...rows, { id: `G${rows.length + 1}`, name: `Thermal-${rows.length + 1}`, pmin: 30, pmax: 100, a: 0.01, b: 18, c: 800, startup: 3000, shutdown: 1200, ramp: 30, min_up: 2, min_down: 1, initial_on: 1 }]);
  async function save() {
    if (errs.length) return;
    setSystem({ ...system, generators: rows });
    try { await saveSystem(); setMsg(user?.demo ? 'Saved locally (demo mode).' : 'Saved.'); } catch (e: any) { setMsg(`Saved locally; server: ${e.message}`); }
  }
  return (
    <Page title="Generator Configuration" subtitle="Define your power system generators and parameters"
      actions={<button className="btn-primary" disabled={rows.length >= 8} onClick={add}>+ Add Generator</button>}>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-slate-400"><tr><th>ID</th><th>Name</th>{COLS.map(([, l]) => <th key={l}>{l}</th>)}<th>Start ON</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1 pr-1"><input className="input w-16" value={r.id} onChange={(e) => upd(i, 'id', e.target.value)} /></td>
                <td className="pr-1"><input className="input w-28" value={r.name} onChange={(e) => upd(i, 'name', e.target.value)} /></td>
                {COLS.map(([k, , step]) => <td key={k} className="pr-1"><input type="number" step={step} className="input w-24" value={r[k] as number} onChange={(e) => upd(i, k, e.target.value)} /></td>)}
                <td><input type="checkbox" checked={!!r.initial_on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, initial_on: e.target.checked ? 1 : 0 } : x)))} /></td>
                <td><button className="text-rose-400" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Delete ${r.id}`} disabled={rows.length <= 1}>✕</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {errs.length > 0 && <ul role="alert" className="mt-3 list-disc rounded-lg bg-rose-950/40 p-3 pl-6 text-xs text-rose-300">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" disabled={errs.length > 0} onClick={save}>Save generators</button>
        <button className="btn-ghost" onClick={() => setRows(system.generators)}>Revert</button>
        <span className="text-xs text-slate-400">{msg}</span>
      </div>
      <p className="mt-3 text-xs text-slate-500">Changing generators does not alter existing results until you press “Run Optimization”.</p>
    </Page>
  );
}
