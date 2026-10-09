const BASE = (import.meta as any).env?.VITE_API_URL ?? '';
let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the API. Start the backend (uvicorn app.main:app --port 8000) or use demo mode.');
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.detail || `Request failed (${res.status})`);
  }
  return res.json();
}
