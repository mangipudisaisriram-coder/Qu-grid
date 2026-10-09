import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Generators from './pages/Generators';
import Demand from './pages/Demand';
import Optimization from './pages/Optimization';
import Results from './pages/Results';
import Settings from './pages/Settings';
const Simulation = lazy(() => import('./pages/Simulation'));   // keeps three.js out of the first bundle

export default function App() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Shell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/generators" element={<Generators />} />
          <Route path="/demand" element={<Demand />} />
          <Route path="/optimization" element={<Optimization />} />
          <Route path="/results" element={<Results />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Landing />} />
      </Routes>
    </Suspense>
  );
}
