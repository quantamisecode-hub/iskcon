/** Simple full-area loading indicator used while content is being fetched. */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center p-10" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
      <span className="ml-3 text-sm text-slate-600">{label}</span>
    </div>
  );
}
