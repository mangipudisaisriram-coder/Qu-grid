import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { COLORS } from '../lib';

export interface SceneGen { id: string; pmin: number; pmax: number }
interface Props {
  gens: SceneGen[]; on: number[]; P: number[]; demandFrac: number;
  interactive?: boolean; onToggle?: (i: number) => void; className?: string;
}

/** Interactive 3D grid: generators -> substation -> city. Pure three.js (no extra React-3D deps). */
export default function GridScene3D({ gens, on, P, demandFrac, interactive = true, onToggle, className = '' }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const live = useRef({ on, P, demandFrac, interactive, onToggle, gens });
  live.current = { on, P, demandFrac, interactive, onToggle, gens };
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [noGL, setNoGL] = useState(false);

  useEffect(() => {
    const el = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setNoGL(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 28, 70);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    let th = 0.6, ph = 0.95, rad = 27;
    const setCam = () => { cam.position.set(rad * Math.sin(ph) * Math.sin(th), rad * Math.cos(ph), rad * Math.sin(ph) * Math.cos(th)); cam.lookAt(0, 1.5, 0); };
    scene.add(new THREE.AmbientLight(0x8899bb, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(10, 20, 8); scene.add(dl);
    scene.add(new THREE.GridHelper(60, 60, 0x1e3a5f, 0x14243b));
    const mat = (c: number, e = 0, ei = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: 0.6, metalness: 0.2 });

    const N = live.current.gens.length;
    const zs = (i: number) => (i - (N - 1) / 2) * 3.6;
    const units = live.current.gens.map((g, i) => {
      const col = new THREE.Color(COLORS[i % COLORS.length]).getHex();
      const grp = new THREE.Group(); grp.position.set(-10, 0, zs(i));
      const bh = 1.2 + g.pmax / 110;
      const base = new THREE.Mesh(new THREE.BoxGeometry(3, bh, 2.4), mat(0x334155)); base.position.y = bh / 2; base.userData.gi = i; grp.add(base);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 12), mat(0x475569)); stack.position.set(0.9, bh + 0.8, 0); grp.add(stack);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 8, 24), mat(col, col, 0)); ring.rotation.x = Math.PI / 2; ring.position.set(-0.4, bh + 0.1, 0); grp.add(ring);
      const fan = new THREE.Group();
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.05), mat(col, col, 0.3)); b.position.y = 0.4; const pv = new THREE.Group(); pv.add(b); pv.rotation.z = k * 2.094; fan.add(pv); }
      fan.position.set(-0.4, bh + 0.1, 0); fan.rotation.x = Math.PI / 2; grp.add(fan);
      const smoke: THREE.Mesh[] = [];
      for (let k = 0; k < 8; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 })); s.userData.t = k / 8; grp.add(s); smoke.push(s); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.4), mat(col, col, 0.8)); bar.position.x = -1.9; grp.add(bar);
      scene.add(grp);
      return { grp, base, fan, ring, smoke, bar, bh, lvl: 0, col };
    });
    const sub = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 2), mat(0x1e293b, 0x38bdf8, 0.25)); sub.position.set(0, 0.7, 0); scene.add(sub);
    const city: THREE.Mesh[] = [];
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
      const h = 1 + Math.random() * 3.5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 1.1), mat(0x1f2937, 0xfde047, 0));
      b.position.set(7 + x * 1.5, h / 2, -3 + z * 1.5); b.userData.r = (x * 5 + z + Math.random()) / 25; scene.add(b); city.push(b);
    }
    const lines: { cu: THREE.QuadraticBezierCurve3; l: THREE.Line; ps: THREE.Mesh[]; gi: number }[] = [];
    const link = (a: THREE.Vector3, b: THREE.Vector3, gi: number) => {
      const mid = a.clone().lerp(b, 0.5); mid.y += 2.2;
      const cu = new THREE.QuadraticBezierCurve3(a, mid, b);
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cu.getPoints(30)), new THREE.LineBasicMaterial({ color: 0x334155 })); scene.add(l);
      const ps: THREE.Mesh[] = [];
      for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: gi >= 0 ? units[gi].col : 0xfde047 })); p.userData.t = k / 5; scene.add(p); ps.push(p); }
      lines.push({ cu, l, ps, gi });
    };
    units.forEach((u, i) => link(new THREE.Vector3(-8.5, 2.2, zs(i)), new THREE.Vector3(-1, 1.4, 0), i));
    link(new THREE.Vector3(1, 1.4, 0), new THREE.Vector3(6.5, 2, 0), -1);

    let drag = false, moved = 0, lx = 0, ly = 0;
    const cv = renderer.domElement;
    const ray = new THREE.Raycaster();
    const pickAt = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
      const h = ray.intersectObjects(units.map((u) => u.base))[0];
      return h ? (h.object.userData.gi as number) : -1;
    };
    const down = (e: PointerEvent) => { drag = true; moved = 0; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - lx, dy = e.clientY - ly; moved += Math.abs(dx) + Math.abs(dy); lx = e.clientX; ly = e.clientY;
        th -= dx * 0.006; ph = Math.min(1.5, Math.max(0.25, ph - dy * 0.006)); setCam(); setHover(null);
      } else if (live.current.interactive) {
        const i = pickAt(e); const r = cv.getBoundingClientRect();
        setHover(i >= 0 ? { i, x: e.clientX - r.left, y: e.clientY - r.top } : null);
        cv.style.cursor = i >= 0 ? 'pointer' : 'grab';
      }
    };
    const up = (e: PointerEvent) => { drag = false; if (moved < 5 && live.current.interactive) { const i = pickAt(e); if (i >= 0) live.current.onToggle?.(i); } };
    const wheel = (e: WheelEvent) => { if (!live.current.interactive) return; e.preventDefault(); rad = Math.min(50, Math.max(10, rad + e.deltaY * 0.02)); setCam(); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
    cv.addEventListener('pointerleave', () => setHover(null)); cv.addEventListener('wheel', wheel, { passive: false });

    const resize = () => { const w = el.clientWidth || 600, h = el.clientHeight || 400; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize(); setCam();

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime, L = live.current;
      units.forEach((u, i) => {
        const isOn = !!L.on[i];
        const tgt = isOn ? (L.P[i] || 0) / (L.gens[i]?.pmax || 1) : 0;
        u.lvl += (tgt - u.lvl) * Math.min(1, dt * 4);
        u.fan.rotation.y += reduce ? 0 : dt * u.lvl * 12;
        (u.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = isOn ? 0.7 + 0.3 * Math.sin(t * 3 + i) : 0;
        u.bar.scale.y = Math.max(0.01, u.lvl * 4); u.bar.position.y = u.bar.scale.y / 2; u.bar.visible = u.lvl > 0.02;
        const bm = u.base.material as THREE.MeshStandardMaterial; bm.emissive.setHex(isOn ? u.col : 0); bm.emissiveIntensity = isOn ? 0.12 : 0;
        u.smoke.forEach((s) => {
          s.userData.t = (s.userData.t + dt * 0.25) % 1; const k = s.userData.t;
          s.visible = isOn; s.position.set(0.9 + k * 0.8, u.bh + 1.6 + k * 3, 0); s.scale.setScalar(0.5 + k * 1.8);
          (s.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
        });
      });
      const total = L.P.reduce((a, b) => a + (b || 0), 0);
      lines.forEach((ln) => {
        const lvl = ln.gi >= 0 ? units[ln.gi].lvl : Math.min(1, total / 800);
        (ln.l.material as THREE.LineBasicMaterial).color.setHex(lvl > 0.02 ? (ln.gi >= 0 ? units[ln.gi].col : 0xfde047) : 0x334155);
        ln.ps.forEach((p) => { p.visible = lvl > 0.02; p.userData.t = (p.userData.t + dt * (0.15 + lvl * 0.5)) % 1; p.position.copy(ln.cu.getPoint(p.userData.t)); p.scale.setScalar(0.6 + lvl); });
      });
      city.forEach((b) => { const m = b.material as THREE.MeshStandardMaterial; const tg = b.userData.r < L.demandFrac ? 0.9 : 0; m.emissiveIntensity += (tg - m.emissiveIntensity) * Math.min(1, dt * 5); });
      (sub.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + (reduce ? 0 : 0.15 * Math.sin(t * 4));
      if (!drag && !reduce) { th += dt * (L.interactive ? 0.03 : 0.12); setCam(); }
      renderer.render(scene, cam);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('wheel', wheel);
      scene.traverse((o: any) => { o.geometry?.dispose?.(); const m = o.material; Array.isArray(m) ? m.forEach((x) => x.dispose()) : m?.dispose?.(); });
      renderer.dispose(); el.removeChild(cv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gens.length]);

  if (noGL) return <div className={`flex items-center justify-center text-sm text-slate-400 ${className}`}>WebGL is unavailable in this browser — use the Schematic view.</div>;
  const h = hover ? gens[hover.i] : null;
  return (
    <div className={`relative ${className}`}>
      <div ref={mount} className="h-full w-full" />
      {hover && h && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-panel/95 px-3 py-2 text-xs shadow-xl" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="font-semibold text-white">{h.id}</div>
          <div className={on[hover.i] ? 'text-emerald-400' : 'text-rose-400'}>{on[hover.i] ? 'ON' : 'OFF'} · {Math.round(P[hover.i] || 0)} MW</div>
          <div className="text-slate-400">Pmin {h.pmin} / Pmax {h.pmax} MW</div>
          {interactive && <div className="mt-1 text-slate-500">Click to toggle</div>}
        </div>
      )}
    </div>
  );
}
