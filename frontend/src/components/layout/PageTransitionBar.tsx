import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Slim app-top progress bar shown during client-side navigation.
 * Self-contained (no dependency): width eases in on route change, completes
 * shortly after; invisible otherwise. Respects prefers-reduced-motion.
 */
export function PageTransitionBar() {
  const location = useLocation();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];

    setVisible(true);
    setWidth(18);

    timers.current.push(window.setTimeout(() => setWidth(72), 150));
    timers.current.push(window.setTimeout(() => setWidth(100), 350));
    timers.current.push(
      window.setTimeout(() => {
        setVisible(false);
        window.setTimeout(() => setWidth(0), 250);
      }, 700),
    );

    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-primary via-primary-dark to-primary shadow-[0_0_12px_rgba(184,66,52,0.55)] transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
