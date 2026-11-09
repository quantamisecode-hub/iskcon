/**
 * Generic placeholder for navigation entries whose business module
 * is scheduled for a later phase (architecture-only at this stage).
 */
export function SectionPlaceholderPage({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">
        This area is reserved for an upcoming module. Access control for this
        section is already enforced (role-aware navigation + backend authorization).
      </p>
    </section>
  );
}
