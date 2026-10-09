import { Generator, RunResult, Sched, SolverView } from './types';

export const COLORS = ['#f59e0b', '#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fb7185', '#facc15', '#60a5fa'];
export const usd = (x: number) => '$' + Math.round(x).toLocaleString('en-US');
export const mw = (x: number) => `${Math.round(x).toLocaleString('en-US')} MW`;

export function scheduleOf(run: RunResult, view: SolverView): Sched {
  if (view === 'classical') return run.classical.schedule;
  return (run as any)[run.best_quantum].schedule as Sched;
}

/** Equal-incremental-cost dispatch of the committed units for ONE hour (client-side, used for manual what-if toggles). */
export function dispatchHour(gens: Generator[], on: number[], demand: number): { P: number[]; shortfall: number } {
  const act = gens.map((g, i) => (on[i] ? g : null));
  const P = (lam: number) => act.map((g) => (g ? Math.min(g.pmax, Math.max(g.pmin, (lam - g.b) / Math.max(2 * g.a, 1e-9))) : 0));
  let lo = 0, hi = 500;
  for (let k = 0; k < 50; k++) {
    const m = (lo + hi) / 2;
    P(m).reduce((s, v) => s + v, 0) < demand ? (lo = m) : (hi = m);
  }
  const p = P(hi);
  return { P: p, shortfall: demand - p.reduce((s, v) => s + v, 0) };
}

export function hourCost(gens: Generator[], P: number[]) {
  return gens.reduce((s, g, i) => s + (P[i] > 0 ? g.a * P[i] ** 2 + g.b * P[i] + g.c : 0), 0);
}

export function histogram(values: number[], bins = 10) {
  if (!values.length) return [];
  const lo = Math.min(...values), hi = Math.max(...values), w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ label: usd(lo + i * w + w / 2), from: lo + i * w, count: 0 }));
  values.forEach((v) => { out[Math.min(bins - 1, Math.floor((v - lo) / w))].count++; });
  return out;
}

export function parseDemandCsv(text: string): number[] {
  const nums = text.split(/\r?\n/).map((l) => l.split(/[,;\t]/).pop()!.trim()).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  return nums.slice(0, 24);
}
