import { useEffect, useState } from 'react';
import { createEvent, updateEvent } from '../api/events.api';
import { useAuth } from '../../../hooks/useAuth';
import { InfoIcon } from '../../../components/ui/icons';
import type { EventDetail } from '../types';

/**
 * Shared create/edit event form rendered inside a modal (edit) or a dedicated page (create).
 * Client-side validation mirrors backend rules; the backend re-validates.
 */
export function EventForm({
  mode,
  event,
  initialDate,
  onSaved,
  onCancel,
  submitLabel,
}: {
  mode: 'create' | 'edit';
  event?: EventDetail;
  initialDate?: string;
  onSaved: (event: EventDetail) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(event?.name ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [eventDate, setEventDate] = useState(event?.eventDate ?? initialDate ?? '');
  const [startTime, setStartTime] = useState(event?.startTime ?? '10:00');
  const [endTime, setEndTime] = useState(event?.endTime ?? '');
  const [numberOfPeople, setNumberOfPeople] = useState<string>(String(event?.numberOfPeople ?? ''));
  const [status, setStatus] = useState<'DRAFT' | 'PLANNING'>('DRAFT');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setError(null);
  }, [name, eventDate, startTime, endTime, numberOfPeople, status]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const people = Number.parseInt(numberOfPeople, 10);
    if (!name.trim()) {
      setError('Event name is required.');
      return;
    }
    if (!eventDate) {
      setError('Event date is required.');
      return;
    }
    if (!startTime) {
      setError('Start time is required.');
      return;
    }
    if (endTime && endTime < startTime) {
      setError('End time must be greater than or equal to start time.');
      return;
    }
    if (!Number.isInteger(people) || people <= 0) {
      setError('Number of people must be a positive whole number.');
      return;
    }

    setIsSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      eventDate,
      startTime,
      endTime: endTime || null,
      numberOfPeople: people,
      location: location.trim() || null,
      notes: notes.trim() || null,
      ...(mode === 'create' ? { status } : {}),
    };

    try {
      const saved =
        mode === 'create' ? await createEvent(payload) : await updateEvent(event!.id, payload);
      onSaved(saved);
    } catch (err) {
      const apiMessage = (err as {
        response?: { data?: { error?: { message?: string } } };
        message?: string;
      })?.response?.data?.error?.message;
      setError(apiMessage ?? 'Could not save the event. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const scopeHint =
    user?.role === 'EXECUTOR'
      ? 'This event is created inside your assigned Admin’s scope automatically — you cannot choose another Admin.'
      : 'This event belongs to your own Admin scope automatically.';

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div role="alert" aria-live="polite" className="rounded-xl border border-danger/25 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Scope assignment — automatic, read-only, per Phase 5 §16 */}
      <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3">
        <InfoIcon className="mt-0.5 h-4 w-4 flex-none text-primary" />
        <div className="min-w-0 text-[11px] leading-snug text-secondary">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-deep">Assignment</p>
          <p className="mt-1">{scopeHint}</p>
        </div>
      </div>

      {/* Basic Information */}
      <fieldset className="space-y-4">
        <legend className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Basic Information</legend>
        <div>
          <label htmlFor="event-name" className="mb-1.5 block text-xs font-semibold text-ink">
            Event name *
          </label>
          <input
            id="event-name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mahaprasadam"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="event-date" className="mb-1.5 block text-xs font-semibold text-ink">
              Date *
            </label>
            <input
              id="event-date"
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <div>
            <label htmlFor="event-people" className="mb-1.5 block text-xs font-semibold text-ink">
              Number of people *
            </label>
            <input
              id="event-people"
              type="number"
              min={1}
              step={1}
              required
              value={numberOfPeople}
              onChange={(e) => setNumberOfPeople(e.target.value)}
              placeholder="500"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="event-start" className="mb-1.5 block text-xs font-semibold text-ink">
              Start time *
            </label>
            <input
              id="event-start"
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1.5 text-[10px] text-muted">24-hour format (e.g. 10:00).</p>
          </div>
          <div>
            <label htmlFor="event-end" className="mb-1.5 block text-xs font-semibold text-ink">
              End time
            </label>
            <input
              id="event-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1.5 text-[10px] text-muted">Must be at or after the start time.</p>
          </div>
          {mode === 'create' && (
            <div>
              <label htmlFor="event-status" className="mb-1.5 block text-xs font-semibold text-ink">
                Status
              </label>
              <select
                id="event-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PLANNING')}
                className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                <option value="DRAFT">Draft</option>
                <option value="PLANNING">Planning</option>
              </select>
              <p className="mt-1.5 text-[10px] text-muted">Both start as planning stages — never deducts stock.</p>
            </div>
          )}
        </div>
      </fieldset>

      {/* Location */}
      <fieldset className="space-y-4 border-t border-border pt-4">
        <legend className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Location</legend>
        <div>
          <label htmlFor="event-location" className="mb-1.5 block text-xs font-semibold text-ink">
            Location
          </label>
          <input
            id="event-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Main Hall"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <div>
          <label htmlFor="event-notes" className="mb-1.5 block text-xs font-semibold text-ink">
            Notes
          </label>
          <textarea
            id="event-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </fieldset>

      {/* Description */}
      <fieldset className="space-y-4 border-t border-border pt-4">
        <legend className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Description</legend>
        <div>
          <label htmlFor="event-description" className="mb-1.5 block text-xs font-semibold text-ink">
            Description
          </label>
          <textarea
            id="event-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-xl border border-border-strong/60 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-70"
        >
          {isSaving ? 'Saving…' : submitLabel ?? (mode === 'create' ? 'Create Event' : 'Save Changes')}
        </button>
      </div>
    </form>
  );
}
