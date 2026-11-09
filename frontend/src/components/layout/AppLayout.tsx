import { Outlet } from 'react-router-dom';

/**
 * Minimal application shell for Phase 1.
 * The final visual identity (ISKCON logo and palette) will be added
 * in a later phase when the owner provides the brand assets.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-wide text-slate-900">FOOD INVENTORY SYSTEM</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-800">Phase 1</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white py-4">
        <p className="mx-auto w-full max-w-5xl px-4 text-xs text-slate-500">
          Development environment foundation - business features arrive in later phases.
        </p>
      </footer>
    </div>
  );
}
