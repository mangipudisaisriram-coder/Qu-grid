import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Logo } from '../components/ui';
import { useStore } from '../store';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [name, setName] = useState('');
  const [show, setShow] = useState(false); const [remember, setRemember] = useState(true);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const { login } = useStore(); const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr('Enter a valid email address.');
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const r = await api<any>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: { email, password: pw, name: name || 'Student' } });
      login(r.user, r.token, remember); nav('/dashboard');
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  async function google() {
    setErr('');
    try { await api('/api/auth/google', { method: 'POST' }); } catch (x: any) { setErr(x.message); }
  }
  return (
    <div className="grid min-h-full bg-navy lg:grid-cols-2">
      <div className="hidden flex-col justify-between p-12 lg:flex">
        <div><Logo size="text-3xl" /><p className="mt-2 text-slate-300">Smart Scheduling, Smarter Grids.</p></div>
        <ul className="space-y-5 text-sm">
          {[['Quantum + Classical Optimization', 'Better solutions, lower cost'], ['Unit Commitment & Load Balancing', 'Reliable and efficient operation'], ['Real Power System Constraints', 'Reserve, ramping, min up/down, start-up costs']].map(([t, d]) => (
            <li key={t} className="flex gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-cyanx" /><div><div className="font-medium text-white">{t}</div><div className="text-slate-400">{d}</div></div></li>))}
        </ul>
      </div>
      <div className="flex items-center justify-center bg-white p-6 text-slate-800">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <Link to="/" className="text-xs text-blue-600">← Back to home</Link>
          <h2 className="text-2xl font-semibold">{mode === 'login' ? 'Welcome Back' : 'Create your account'}</h2>
          <div className="grid grid-cols-2 border-b border-slate-200 text-sm">
            {(['login', 'signup'] as const).map((m) => (
              <button type="button" key={m} onClick={() => { setMode(m); setErr(''); }} className={`pb-2 ${mode === m ? 'border-b-2 border-blue-600 font-medium text-blue-600' : 'text-slate-500'}`}>{m === 'login' ? 'Login' : 'Sign Up'}</button>))}
          </div>
          {mode === 'signup' && <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />}
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-16 text-sm" placeholder="Password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className="absolute right-3 top-2 text-xs text-slate-500" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember me</label>
          {err && <div role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{err}</div>}
          <button disabled={busy} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create account'}</button>
          <div className="text-center text-xs text-slate-400">OR</div>
          <button type="button" onClick={google} className="w-full rounded-lg border border-slate-300 py-2 text-sm hover:bg-slate-50">Continue with Google</button>
          <button type="button" onClick={() => { login({ name: 'Student (demo)', email: 'demo@local', demo: true }, null); nav('/dashboard'); }} className="w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-700 hover:bg-slate-200">Continue in demo mode (no backend)</button>
        </form>
      </div>
    </div>
  );
}
