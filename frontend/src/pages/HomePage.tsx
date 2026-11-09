import { useApiHealth } from '../hooks/useApiHealth';
import { StatusBadge } from '../components/ui/StatusBadge';
import { appConfig } from '../config/env';

/**
 * Phase 1 shell ONLY. It verifies the secure environment works
 * end to end (frontend -> API) and nothing more.
 */
export function HomePage() {
  const { status } = useApiHealth();

  const apiBadge =
    status === 'connected'
      ? { label: 'Connected', tone: 'positive' as const }
      : status === 'checking'
        ? { label: 'Checking…', tone: 'neutral' as const }
        : { label: 'API Unavailable', tone: 'negative' as const };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Food Inventory System</h1>
      <p className="mt-1 text-slate-600">Development Environment</p>

      <dl className="mt-8 space-y-5">
        <div className="flex items-center gap-3">
          <dt className="w-32 text-sm font-medium text-slate-500">API Status:</dt>
          <dd>
            <StatusBadge label={apiBadge.label} tone={apiBadge.tone} />
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="w-32 text-sm font-medium text-slate-500">Environment:</dt>
          <dd className="text-sm text-slate-700">
            {appConfig.isDevelopment ? 'Development' : 'Production'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
