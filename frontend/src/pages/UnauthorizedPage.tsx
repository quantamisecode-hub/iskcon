export function UnauthorizedPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-2 text-slate-600">
        You do not have permission to view this page. Ask an administrator if you believe this is a mistake.
      </p>
    </section>
  );
}
