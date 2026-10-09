import { ReactNode } from 'react';
import { COLORS } from '../lib';

export const Logo = ({ size = 'text-lg' }: { size?: string }) => (
  <div className={`flex items-center gap-2 font-semibold text-white ${size}`}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#38bdf8"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>
    Quantum<span className="text-cyanx">UC</span>
  </div>
);

export const Stat = ({ label, value, sub, tone = 'text-slate-400' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) => (
  <div className="card">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    {sub && <div className={`mt-1 text-xs ${tone}`}>{sub}</div>}
  </div>
);

export const Page = ({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) => (
  <div className="mx-auto max-w-7xl p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-white sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
    {children}
  </div>
);

/** units x hours ON/OFF heatmap; click a column to pick an hour. */
export function Heatmap({ u, ids, hour, onPick, compact }: { u: number[][]; ids: string[]; hour?: number; onPick?: (h: number) => void; compact?: boolean }) {
  const T = u[0]?.length ?? 0;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px]">
        {u.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="w-7 shrink-0 text-[10px] text-slate-400">{ids[i]}</span>
            <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${T}, minmax(0, 1fr))` }}>
              {row.map((v, h) => (
                <button key={h} onClick={() => onPick?.(h)} title={`${ids[i]} · hour ${h} · ${v ? 'ON' : 'OFF'}`}
                  className={`${compact ? 'h-3' : 'h-5'} rounded-[2px] ${hour === h ? 'ring-1 ring-white' : ''}`}
                  style={{ background: v ? COLORS[i % COLORS.length] : '#1e293b', opacity: v ? 0.9 : 1 }} />
              ))}
            </div>
          </div>
        ))}
        <div className="ml-8 mt-1 flex justify-between text-[10px] text-slate-500"><span>0h</span><span>{Math.floor(T / 2)}h</span><span>{T - 1}h</span></div>
      </div>
    </div>
  );
}
