interface StatusBadgeProps {
  label: string;
  tone: 'positive' | 'neutral' | 'negative';
}

/** Small reusable pill used for status values like the API connection. */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const toneClasses: Record<StatusBadgeProps['tone'], string> = {
    positive: 'bg-emerald-100 text-emerald-800',
    neutral: 'bg-slate-200 text-slate-700',
    negative: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}
