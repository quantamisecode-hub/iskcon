import type { ComponentType, ReactNode } from 'react';
import {
  AlertCircleIcon,
  BoxIcon,
  CalendarIcon,
  ClockIcon,
  CoinsIcon,
  DescriptionIcon,
  FileTextIcon,
  FlagIcon,
  GaugeIcon,
  GridIcon,
  InfoIcon,
  LayersIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  RulerIcon,
  ShieldIcon,
  StoreIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
  UtensilsIcon,
  VerifiedBadgeIcon,
  WheatIcon,
  type IconProps,
} from './icons';

/**
 * One place that decides which icon belongs to which form field.
 * Keys are the `htmlFor` ids used across the application.
 */
const FIELD_ICONS: Record<string, ComponentType<IconProps>> = {
  // Identity & access
  email: MailIcon,
  'u-email': MailIcon,
  'p-email': MailIcon,
  password: LockIcon,
  'u-password': LockIcon,
  'p-cur': LockIcon,
  'p-new': LockIcon,
  'p-confirm': LockIcon,
  'p-email-pass': LockIcon,
  'u-first': UserIcon,
  'u-last': UserIcon,
  'p-first': UserIcon,
  'p-last': UserIcon,
  'u-role': ShieldIcon,

  // Events
  'event-name': FlagIcon,
  'event-type': FlagIcon,
  'event-serving-type': UtensilsIcon,
  'event-date': CalendarIcon,
  'event-start': ClockIcon,
  'event-people': UsersIcon,
  'event-contact': UserIcon,
  'event-mobile': PhoneIcon,
  'event-location': MapPinIcon,
  'event-description': DescriptionIcon,
  'event-notes': FileTextIcon,
  'event-status': ShieldIcon,
  'event-donation-amount': CoinsIcon,
  'event-donation-given-by': UserIcon,
  'completion-donation-type': CoinsIcon,
  'completion-amount': CoinsIcon,
  'completion-tr': FileTextIcon,

  // Dishes & inventory master
  'dish-name': UtensilsIcon,
  'dish-description': DescriptionIcon,
  'cat-name': LayersIcon,
  'cat-desc': DescriptionIcon,
  'unit-name': RulerIcon,
  'unit-symbol': TagIcon,
  'unit-type': GridIcon,
  'fi-name': WheatIcon,
  'fi-desc': DescriptionIcon,
  'fi-cat': LayersIcon,
  'fi-unit': RulerIcon,
  'fi-min': GaugeIcon,
  'fi-reorder': BoxIcon,
  'vendor-name': StoreIcon,
  'vendor-contact': UserIcon,
  'vendor-phone': PhoneIcon,
  'vendor-email': MailIcon,
  'vendor-gst': VerifiedBadgeIcon,
  'vendor-city': MapPinIcon,
  'vendor-state': MapPinIcon,
  'vendor-address': MapPinIcon,
  'vendor-terms': CoinsIcon,
  'vendor-notes': FileTextIcon,

  // Planning, requests, returns, dispatch
  'detail-qty': GaugeIcon,
  'stock-item': BoxIcon,
  'stock-qty': GaugeIcon,
  'stock-vendor': StoreIcon,
  'stock-purchase-date': CalendarIcon,
  'stock-received-date': CalendarIcon,
  'stock-unit-cost': CoinsIcon,
  'stock-reference': FileTextIcon,
  'stock-notes': DescriptionIcon,
  'stock-out-item': BoxIcon,
  'stock-out-event': FlagIcon,
  'stock-out-qty': GaugeIcon,
  'stock-out-reason': AlertCircleIcon,
  'request-notes': FileTextIcon,
  'return-notes': FileTextIcon,
  'return-reason': AlertCircleIcon,
  'return-reason-note': FileTextIcon,
  'additional-reason': AlertCircleIcon,
  'additional-note': FileTextIcon,
  'additional-notes': FileTextIcon,
  'cancel-reason': AlertCircleIcon,
  'reject-reason': AlertCircleIcon,
  'detail-reason': AlertCircleIcon,
  'dispatch-destination': MapPinIcon,
  'dispatch-verifier': VerifiedBadgeIcon,
  'assign-admin': UsersIcon,
};

export function FieldIcon({ htmlFor, className = 'h-3.5 w-3.5 flex-none text-primary' }: { htmlFor?: string; className?: string }) {
  const fieldId = htmlFor?.startsWith('multi-add-') ? 'multi-add' : htmlFor ?? '';
  const Icon = FIELD_ICONS[fieldId] ?? InfoIcon;
  return <Icon className={className} aria-hidden="true" />;
}

/** A form label with a context-appropriate icon. */
export function FieldLabel({
  htmlFor,
  children,
  className = 'mb-1.5 block text-xs font-semibold text-ink',
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      <span className="inline-flex items-center gap-1.5">
        <FieldIcon htmlFor={htmlFor} />
        <span>{children}</span>
      </span>
    </label>
  );
}
