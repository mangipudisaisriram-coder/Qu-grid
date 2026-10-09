import { useStore } from './store';
import { dispatchHour, hourCost, scheduleOf } from './lib';

/** Derived state for the selected hour: schedule (+ manual what-if edits) -> dispatch, reserve, cost, status. */
export function useGrid() {
  const { run, view, hour, edits } = useStore();
  const sched = scheduleOf(run, view);
  const gens = run.system.generators;
  const demand = run.system.demand;
  const T = demand.length;
  const h = Math.min(hour, T - 1);
  const on = gens.map((_, i) => { const k = `${h}-${i}`; return k in edits ? edits[k] : sched.u[i][h]; });
  const edited = gens.some((_, i) => `${h}-${i}` in edits);
  let P = gens.map((_, i) => sched.P[i][h]);
  let shortfall = demand[h] - P.reduce((s, v) => s + v, 0);
  if (edited) { const d = dispatchHour(gens, on, demand[h]); P = d.P; shortfall = d.shortfall; }
  const gen = P.reduce((s, v) => s + v, 0);
  const cap = gens.reduce((s, g, i) => s + (on[i] ? g.pmax : 0), 0);
  const reserve = cap - demand[h];
  const needed = (demand[h] * run.system.reserve_pct) / 100;
  const status = Math.abs(shortfall) > 1 ? 'Shortfall' : reserve < needed - 1e-6 ? 'Low reserve' : 'Feasible';
  const hourlyGen = demand.map((_, t) => gens.reduce((s, __, i) => s + sched.P[i][t], 0));
  const hourlyCap = demand.map((_, t) => gens.reduce((s, g, i) => s + (sched.u[i][t] ? g.pmax : 0), 0));
  return { run, view, hour: h, T, gens, demand, sched, on, P, gen, cap, reserve, reservePct: (reserve / Math.max(demand[h], 1)) * 100,
    status, edited, cost: hourCost(gens, P), shortfall, hourlyGen, hourlyCap, demandFrac: Math.min(1, demand[h] / Math.max(...demand)) };
}
