import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import { useStore } from '../store';
import { scheduleOf } from '../lib';
const GridScene3D = lazy(() => import('../components/GridScene3D'));

export default function Landing() {
  const { run, user } = useStore();
  const sched = scheduleOf(run, 'quantum');
  const h = 11;
  const gens = run.system.generators;
  const go = user ? '/simulation' : '/login';
  return (
    <div className="min-h-full bg-navy">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Logo size="text-xl" />
        <div className="hidden gap-6 text-sm text-slate-300 sm:flex">
          <a href="#top" className="text-white">Home</a><a href="#features">Features</a><a href="#about">About</a><Link to="/results">Results</Link><a href="#about">Contact</a>
        </div>
        <Link to={user ? '/dashboard' : '/login'} className="btn-primary">Get Started →</Link>
      </nav>
      <section id="top" className="mx-auto grid max-w-7xl items-center gap-8 px-6 pb-10 pt-6 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">Quantum-Assisted<br />Unit Commitment &amp;<br /><span className="text-cyanx">Load Balancing</span></h1>
          <p className="mt-5 max-w-lg text-slate-300">A hybrid quantum-classical approach to optimize power system scheduling, reduce costs and balance demand efficiently.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to={go} className="btn-primary">▣ Start Simulation →</Link>
            <a href="#features" className="btn-ghost">▷ Learn More</a>
          </div>
        </div>
        <div className="h-[380px] overflow-hidden rounded-2xl border border-line shadow-glow sm:h-[440px]">
          <Suspense fallback={<div className="p-6 text-slate-500">Loading 3D scene…</div>}>
            <GridScene3D className="h-full" interactive={false} gens={gens} on={gens.map((_, i) => sched.u[i][h])} P={gens.map((_, i) => sched.P[i][h])} demandFrac={0.85} />
          </Suspense>
        </div>
      </section>
      <section id="features" className="mx-auto grid max-w-7xl gap-4 px-6 pb-12 sm:grid-cols-3">
        {[['Lower Operating Cost', 'MILP baseline vs. QUBO-based schedules, compared by cost and optimality gap.'],
          ['Efficient Load Balancing', 'Every candidate is dispatched and checked for balance, reserve, ramping and min up/down time.'],
          ['Quantum Optimization', 'QUBO + simulated annealing, and QAOA on a statevector simulator. No quantum hardware is used.']].map(([t, d]) => (
          <div key={t} className="card"><div className="font-medium text-cyanx">{t}</div><p className="mt-2 text-sm text-slate-400">{d}</p></div>
        ))}
      </section>
      <section id="about" className="mx-auto max-w-7xl px-6 pb-12 text-sm text-slate-500">
        Student/pilot research testbed on a small 5-unit, 24-hour system. Results illustrate the workflow, not production grid operation.
      </section>
    </div>
  );
}
