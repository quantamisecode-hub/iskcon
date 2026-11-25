import { useEffect, useState } from 'react';
import { createEvent, updateEvent } from '../api/events.api';
import { useAuth } from '../../../hooks/useAuth';
import { InfoIcon } from '../../../components/ui/icons';
import { DatePicker } from '../../../components/ui/DatePicker';
import { displayDateToIso, isoDateToDisplay } from '../../../utils/dateTime';
import { APP_CONSTANTS, EVENT_TYPES, LEGACY_EVENT_TYPES, SERVING_TYPES } from '../../../constants/appConstants';
import type { EventDetail } from '../types';
import { FieldLabel } from '../../../components/ui/FieldLabel';


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
  // The field shows DD/MM/YYYY; the API receives YYYY-MM-DD on submit.
  const [eventDate, setEventDate] = useState(isoDateToDisplay(event?.eventDate ?? initialDate ?? ''));
  // Native time input uses the API's canonical HH:MM (24-hour) value.
  const [startTime, setStartTime] = useState(event?.startTime ?? '10:00');
  const [numberOfPeople, setNumberOfPeople] = useState<string>(String(event?.numberOfPeople ?? ''));
  const [status, setStatus] = useState<'DRAFT' | 'PLANNING'>('DRAFT');
  const [eventType, setEventType] = useState(event?.eventType ?? '');
  const [servingType, setServingType] = useState(event?.servingType ?? '');
  const [contactPerson, setContactPerson] = useState(event?.contactPerson ?? '');
  const [mobileNumber, setMobileNumber] = useState(event?.mobileNumber ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [donationAmount, setDonationAmount] = useState<string>(String(event?.donationAmount ?? ''));
  const [donationGivenBy, setDonationGivenBy] = useState(event?.donationGivenBy ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setError(null);
  }, [name, eventDate, startTime, numberOfPeople, status]);

  useEffect(() => {
    if (event) {
      setEventDate(isoDateToDisplay(event.eventDate ?? ''));
      setStartTime(event.startTime ?? '10:00');
    }
  }, [event?.id, event?.eventDate, event?.startTime]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const people = Number.parseInt(numberOfPeople, 10);
    if (!name.trim()) {
      setError('Event name is required.');
      return;
    }
    if (!eventType) {
      setError('Event type is required.');
      return;
    }
    if (!contactPerson.trim()) {
      setError('Contact person is required.');
      return;
    }
    const isoDate = displayDateToIso(eventDate);
    if (!isoDate) {
      setError('Enter a valid date in DD/MM/YYYY format.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setError('Enter a valid start time.');
      return;
    }
    if (!Number.isInteger(people) || people <= 0) {
      setError('Number of people must be a positive whole number.');
      return;
    }
    const mobile = mobileNumber.trim();
    if (!mobile) {
      setError('Mobile number is required.');
      return;
    }
    if (!/^\+?[0-9][0-9\s-]{6,29}$/.test(mobile)) {
      setError('Enter a valid mobile number.');
      return;
    }

    setIsSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      eventDate: isoDate,
      startTime,
      numberOfPeople: people,
      eventType: eventType || null,
      servingType: servingType || null,
      contactPerson: contactPerson.trim() || null,
      mobileNumber: mobile,
      location: location.trim() || null,
      notes: notes.trim() || null,
      donationAmount: donationAmount ? Number.parseFloat(donationAmount) : null,
      donationGivenBy: donationGivenBy.trim() || null,
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
      : user?.role === 'EVENT_CREATOR'
        ? 'This event will be created under your own account. You can create and view it, but cannot edit or manage it afterwards.'
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
          <FieldLabel htmlFor="event-name" className="mb-1.5 block text-xs font-semibold text-ink">
            Event name *
          </FieldLabel>
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

        <div>
          <FieldLabel htmlFor="event-type" className="mb-1.5 block text-xs font-semibold text-ink">
            Event type <span className="text-danger">*</span>
          </FieldLabel>
          <select
            id="event-type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            <option value="">Select event type…</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
            {LEGACY_EVENT_TYPES.filter((type) => type === eventType).map((type) => (
              <option key={type} value={type}>{type} (legacy)</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="event-date" className="mb-1.5 block text-xs font-semibold text-ink">
              Date *
            </FieldLabel>
            <DatePicker
              id="event-date"
              value={eventDate}
              onChange={setEventDate}
              required
            />
            <p className="mt-1.5 text-[10px] text-muted">DD/MM/YYYY — click the calendar icon to pick a date.</p>
          </div>
          <div>
            <FieldLabel htmlFor="event-people" className="mb-1.5 block text-xs font-semibold text-ink">
              Number of people *
            </FieldLabel>
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
          <div>
            <FieldLabel htmlFor="event-serving-type" className="mb-1.5 block text-xs font-semibold text-ink">
              Type
            </FieldLabel>
            <select
              id="event-serving-type"
              value={servingType}
              onChange={(e) => setServingType(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            >
              <option value="">Select…</option>
              {SERVING_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <FieldLabel htmlFor="event-start" className="mb-1.5 block text-xs font-semibold text-ink">
              Start time *
            </FieldLabel>
            <input
              id="event-start"
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1.5 text-[10px] text-muted">24-hour format (HH:MM).</p>
          </div>
          {mode === 'create' && (
            <div>
              <FieldLabel htmlFor="event-status" className="mb-1.5 block text-xs font-semibold text-ink">
                Status
              </FieldLabel>
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
        <legend className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Address</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="event-contact" className="mb-1.5 block text-xs font-semibold text-ink">
              Contact Person <span className="text-danger">*</span>
            </FieldLabel>
            <input
              id="event-contact"
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              maxLength={APP_CONSTANTS.event.contactPersonMaxLength}
              placeholder="Primary contact at the venue"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <div>
            <FieldLabel htmlFor="event-mobile" className="mb-1.5 block text-xs font-semibold text-ink">
              Mobile Number <span className="text-danger">*</span>
            </FieldLabel>
            <input
              id="event-mobile"
              type="tel"
              required
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              maxLength={APP_CONSTANTS.event.mobileNumberMaxLength}
              placeholder="e.g. +91 98765 43210"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="event-location" className="mb-1.5 block text-xs font-semibold text-ink">
            Address
          </FieldLabel>
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
          <FieldLabel htmlFor="event-notes" className="mb-1.5 block text-xs font-semibold text-ink">
            Notes
          </FieldLabel>
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
          <FieldLabel htmlFor="event-description" className="mb-1.5 block text-xs font-semibold text-ink">
            Description
          </FieldLabel>
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

      {/* Donation - ADMIN only: optional donation amount + donor */}
      {user?.role === 'ADMIN' && (
      <fieldset className="space-y-4 border-t border-border pt-4">
        <legend className="text-[10px] font-bold uppercase tracking-[0.22em] text-secondary">Donation</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="event-donation-amount" className="mb-1.5 block text-xs font-semibold text-ink">
              ₹ Donation amount
            </FieldLabel>
            <input
              id="event-donation-amount"
              type="number"
              min={0}
              step="0.01"
              value={donationAmount}
              onChange={(e) => setDonationAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1.5 text-[10px] text-muted">Optional monetary donation amount.</p>
          </div>
          <div>
            <FieldLabel htmlFor="event-donation-given-by" className="mb-1.5 block text-xs font-semibold text-ink">
              Donation given by
            </FieldLabel>
            <input
              id="event-donation-given-by"
              type="text"
              value={donationGivenBy}
              onChange={(e) => setDonationGivenBy(e.target.value)}
              placeholder="e.g. Devotee Name"
              className="w-full rounded-xl border border-border-strong/70 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-muted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <p className="mt-1.5 text-[10px] text-muted">Name of the person or organization that gave the donation.</p>
          </div>
        </div>
      </fieldset>
      )}

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
