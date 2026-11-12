import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarIcon, ArrowLeftIcon } from '../components/ui/icons';
import { EventForm } from '../features/events/components/EventForm';
import type { EventDetail } from '../features/events/types';

/**
 * Dedicated full-page create-event experience (spec §16).
 * Success navigates to the Event Details workspace.
 */
export function EventNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date') ?? undefined;

  const handleSaved = (event: EventDetail) => {
    navigate(`/events/${event.id}`, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link
        to="/calendar"
        className="inline-flex items-center gap-2 text-xs font-bold text-secondary transition hover:text-primary"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Calendar
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
            <span className="inline-flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Create Event</span>
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink">Create Event</h1>
          <p className="mt-1 text-sm text-secondary">Plan an event and its required dishes and materials.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <EventForm
          mode="create"
          initialDate={initialDate}
          onSaved={handleSaved}
          onCancel={() => navigate(-1)}
          submitLabel="Create Event"
        />
      </div>
    </div>
  );
}
