import { create } from 'zustand';
import demoRun from './data/demoRun.json';
import { api, setToken } from './api';
import { Config, RunResult, SolverView, System } from './types';

const DEMO = demoRun as unknown as RunResult;
type User = { name: string; email: string; demo?: boolean };
type RunState = { status: 'idle' | 'running' | 'done' | 'error'; progress: number; message: string; error: string | null };

interface S {
  user: User | null; system: System; run: RunResult; usingDemoRun: boolean; config: Config; runState: RunState;
  view: SolverView; hour: number; playing: boolean; edits: Record<string, number>;
  login: (user: User, token: string | null, remember?: boolean) => void; logout: () => void;
  setSystem: (s: System) => void; saveSystem: () => Promise<void>; setConfig: (c: Partial<Config>) => void;
  setView: (v: SolverView) => void; setHour: (h: number) => void; setPlaying: (p: boolean) => void;
  toggleUnit: (i: number, currentOn: number) => void; clearEdits: () => void; runOptimization: () => Promise<void>;
}

const saved = (() => { try { return JSON.parse(localStorage.getItem('quc_user') || sessionStorage.getItem('quc_user') || 'null'); } catch { return null; } })();
const savedToken = localStorage.getItem('quc_token') || sessionStorage.getItem('quc_token');
if (savedToken) setToken(savedToken);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useStore = create<S>((set, get) => ({
  user: saved, system: DEMO.system, run: DEMO, usingDemoRun: true,
  config: { solver: 'qaoa', horizon: 24, reads: 48, sweeps: 300, penalty: 5, qaoa_p: 2, qaoa_shots: 2048, qaoa_engine: 'numpy' },
  runState: { status: 'idle', progress: 0, message: '', error: null },
  view: 'quantum', hour: 11, playing: false, edits: {},

  login: (user, token, remember = true) => {
    const store = remember ? localStorage : sessionStorage;
    store.setItem('quc_user', JSON.stringify(user));
    if (token) store.setItem('quc_token', token);
    setToken(token);
    set({ user });
    if (token) api<System>('/api/system').then((s) => set({ system: s })).catch(() => {});
  },
  logout: () => {
    ['quc_user', 'quc_token'].forEach((k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); });
    setToken(null);
    set({ user: null, system: DEMO.system, run: DEMO, usingDemoRun: true });
  },
  setSystem: (system) => set({ system }),
  saveSystem: async () => { if (!get().user?.demo) await api('/api/system', { method: 'PUT', body: get().system }); },
  setConfig: (c) => set({ config: { ...get().config, ...c } }),
  setView: (view) => set({ view }),
  setHour: (hour) => set({ hour, edits: {} }),
  setPlaying: (playing) => set({ playing }),
  toggleUnit: (i, currentOn) => set({ edits: { ...get().edits, [`${get().hour}-${i}`]: 1 - currentOn } }),
  clearEdits: () => set({ edits: {} }),

  runOptimization: async () => {
    const { config, system, user } = get();
    const sys = { ...system, demand: system.demand.slice(0, config.horizon) };
    set({ runState: { status: 'running', progress: 0.02, message: 'Starting', error: null } });
    try {
      if (!user || user.demo) {                           // demo mode: replay the bundled, pre-computed run
        const steps = ['Solving classical MILP baseline', 'Building QUBO', 'Annealing QUBO', 'Running QAOA (simulated)', 'Evaluating'];
        for (let k = 0; k < steps.length; k++) { set({ runState: { status: 'running', progress: (k + 1) / (steps.length + 1), message: steps[k], error: null } }); await sleep(450); }
        set({ run: DEMO, usingDemoRun: true, system: DEMO.system, runState: { status: 'done', progress: 1, message: 'Bundled demo results (demo mode, backend not used)', error: null } });
        return;
      }
      const { id } = await api<{ id: string }>('/api/runs', { method: 'POST', body: { system: sys, config: { ...config, robustness: true } } });
      for (;;) {
        await sleep(700);
        const r = await api<any>(`/api/runs/${id}`);
        set({ runState: { status: 'running', progress: r.progress, message: r.message, error: null } });
        if (r.status === 'done') { set({ run: r.result, usingDemoRun: false, hour: 0, edits: {}, runState: { status: 'done', progress: 1, message: 'Done', error: null } }); return; }
        if (r.status === 'error') throw new Error(r.error || 'Optimization failed');
      }
    } catch (e: any) {
      set({ runState: { status: 'error', progress: 0, message: '', error: e.message } });
    }
  },
}));
