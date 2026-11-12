import { Link } from 'react-router-dom';
import { EventStatusBadge } from '../../events/components/EventStatusBadge';
import type { DashboardEvent } from '../api/dashboard.api';
import { formatShortDate } from '../utils';

/** Clickable event rows used in Today's / Upcoming widgets. */
export function EventList({
  events,
  emptyMessage,
  emptyHint,
}: {
  events: DashboardEvent[];
  emptyMessage: string;
  emptyHint?: string;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <p className="text-sm font-semibold text-ink">{emptyMessage}</p>
        {emptyHint && <p className="mt-1 text-xs text-secondary">{emptyHint}</p>}
        <Link
          to="/events/new"
          className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-dark"
        >
          + Create Event
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/70">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            to={`/events/${event.id}`}
            className="group flex items-center gap-4 py-3 transition hover:-translate-y-px"
          >
            <div className="w-20 flex-none text-center">
              <p className="text-sm font-bold leading-none text-primary tabular-nums">{event.startTime}</p>
              {event.endTime && <p className="mt-1 text-[10px] font-medium text-muted tabular-nums">to {event.endTime}</p>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink transition group-hover:text-primary-deep">
                {event.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-secondary">
                {formatShortDate(event.eventDate)} · {event.numberOfPeople} people
                {event.location ? ` · 📍 ${event.location}` : ''}
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <EventStatusBadge status={event.status} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
