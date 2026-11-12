import { Modal } from '../../../components/ui/Modal';
import { EventForm } from './EventForm';
import type { EventDetail } from '../types';

/**
 * Modal shell for the shared EventForm.
 * Used for editing (event detail page) and for quick-create flows where a full page is not wanted.
 */
export function EventFormModal({
  mode,
  event,
  initialDate,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  event?: EventDetail;
  initialDate?: string;
  onClose: () => void;
  onSaved: (event: EventDetail) => void;
}) {
  return (
    <Modal title={mode === 'create' ? 'Create Event' : 'Edit Event'} onClose={onClose} maxWidthClass="max-w-xl">
      <EventForm mode={mode} event={event} initialDate={initialDate} onSaved={onSaved} onCancel={onClose} />
    </Modal>
  );
}
