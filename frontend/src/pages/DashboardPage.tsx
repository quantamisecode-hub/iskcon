import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchDashboardSummary, type DashboardSummary } from '../features/dashboard/api/dashboard.api';
import { AdminDashboard } from '../features/dashboard/components/AdminDashboard';
import { ExecutorDashboard } from '../features/dashboard/components/ExecutorDashboard';
import { RefreshIcon } from '../features/dashboard/components/icons';
import { Skeleton } from '../components/ui/Skeleton';
import { dateLine } from '../features/dashboard/utils';

/**
 * Dashboard landing — role-aware (Admin / Executor).
 * Data comes exclusively from the real /dashboard/summary API.
 * Each failure renders a recoverable error panel; widgets render their own
 * empty states when there is no data.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showRefreshSpinner: boolean) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    setError(null);
    try {
      const result = await fetchDashboardSummary();
      setSummary(result);
    } catch (err) {
      const apiMessage = (err as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      })?.response?.data?.error?.message;
      setError(apiMessage ?? 'Unable to load the dashboard. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">Dashboard</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Hare Krishna, {user?.firstName} Prabhu Ji <span aria-hidden="true">🙏</span>
          </h1>
          <p className="mt-1 text-sm text-secondary">{dateLine()}</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={isRefreshing}
          aria-label="Refresh dashboard"
          className="flex items-center gap-2 rounded-xl border border-border-strong/60 bg-card px-4 py-2.5 text-xs font-semibold text-ink transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
        >
          <RefreshIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* States */}
      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-danger/25 bg-danger-soft p-8 text-center">
          <p className="text-base font-bold text-danger">Dashboard couldn't load</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-danger/90">{error}</p>
          <button
            type="button"
            onClick={() => void load(false)}
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
          >
            Try Again
          </button>
        </div>
      ) : summary?.role === 'ADMIN' ? (
        <AdminDashboard summary={summary} />
      ) : summary ? (
        <ExecutorDashboard summary={summary} />
      ) : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading dashboard" role="status">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="mt-3 h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-24 w-full" />
            <Skeleton className="mt-3 h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
