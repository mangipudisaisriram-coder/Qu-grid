import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Intro video gate.
 *
 * Wrap the app with it: the intro plays full-screen first (muted), and the app is mounted only once the
 * intro ends, so the app's own start-up work (route code, three.js scene, API calls) never competes with
 * video playback and cannot cause stutter. Nothing inside the app is changed.
 *
 * - Plays once per browser session; afterwards the app renders immediately with no overlay.
 * - Any failure (autoplay blocked, missing file, storage disabled) skips the intro and shows the app.
 */
const SEEN_KEY = 'quantumuc_intro_seen';

function alreadySeen(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

export default function IntroGate({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState(() => !alreadySeen()); // overlay present
  const [appReady, setAppReady] = useState(() => alreadySeen()); // app mounted
  const [fading, setFading] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    markSeen();
    setAppReady(true);                                   // mount the app while the overlay is still opaque
    window.setTimeout(() => setFading(true), 350);       // let it settle, then fade for a smooth reveal
    window.setTimeout(() => setOverlay(false), 350 + 600);
  };

  useEffect(() => {
    if (!overlay) return;
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip: CSSProperties = {
    position: 'absolute', bottom: 24, right: 24, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.6)', color: '#fff',
    fontSize: 13, letterSpacing: 0.3,   // no backdrop-filter: blurring live video is expensive
  };

  return (
    <>
      {appReady && children}
      {overlay && (
        <div
          role="dialog" aria-label="Introduction video"
          style={{
            position: 'fixed', inset: 0, zIndex: 99999, background: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: fading ? 0 : 1, transition: 'opacity 600ms ease',
          }}
        >
          <video
            ref={ref}
            src={`${import.meta.env.BASE_URL}intro.mp4`}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            onEnded={close}
            onError={close}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
          />
          <button style={skip} onClick={close}>Skip intro ›</button>
        </div>
      )}
    </>
  );
}
