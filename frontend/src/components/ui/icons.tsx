/**
 * Shared stroke icon set (Feather-style) for the whole application.
 * Single source of truth — pages/components import from here instead of
 * inlining one-off SVGs. Stroke inherits currentColor, sized via className.
 */
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

const stroke = (props: IconProps) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
  ...props,
});

function I({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return <svg {...stroke(props)}>{children}</svg>;
}

export function SearchIcon(props: IconProps) {
  return <I {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></I>;
}
export function TagIcon(props: IconProps) {
  return <I {...props}><path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3H5a2 2 0 0 0-2 2v4.59A2 2 0 0 0 3.83 11l9.58 9.58a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.82z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></I>;
}
export function DescriptionIcon(props: IconProps) {
  return <I {...props}><path d="M4 6h16" /><path d="M4 10h16" /><path d="M4 14h10" /><path d="M4 18h7" /></I>;
}
export function LayersIcon(props: IconProps) {
  return <I {...props}><path d="M12 3L2 9l10 6 10-6-10-6z" /><path d="M2 14l10 6 10-6" /></I>;
}
export function RulerIcon(props: IconProps) {
  return <I {...props}><path d="M3 17l6 6L21 11a2 2 0 0 0 0-2.83l-6-6a2 2 0 0 0-2.83 0L3 12.83A2 2 0 0 0 3 17z" /><path d="M8 12l2 2M12 8l2 2" /></I>;
}
export function BoxIcon(props: IconProps) {
  return <I {...props}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v10" /></I>;
}
export function ArchiveIcon(props: IconProps) {
  return <I {...props}><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" /><path d="M10 13h4" /></I>;
}
export function GaugeIcon(props: IconProps) {
  return <I {...props}><path d="M12 15l4-6" /><path d="M4.5 19a9 9 0 1 1 15 0" /><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" /></I>;
}
export function CalendarIcon(props: IconProps) {
  return <I {...props}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3v4M16 3v4M3 10h18" /></I>;
}
export function ClockIcon(props: IconProps) {
  return <I {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></I>;
}
export function UsersIcon(props: IconProps) {
  return <I {...props}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5S15.5 16.5 15.5 20" /><circle cx="17" cy="9" r="2.8" /><path d="M15.5 14.7c3 .3 6 2 6 5.3" /></I>;
}
export function MapPinIcon(props: IconProps) {
  return <I {...props}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></I>;
}
export function FileTextIcon(props: IconProps) {
  return <I {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6M9 9h2" /></I>;
}
export function MailIcon(props: IconProps) {
  return <I {...props}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M4 7l8 6 8-6" /></I>;
}
export function LockIcon(props: IconProps) {
  return <I {...props}><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8 10V7.8a4 4 0 0 1 8 0V10" /></I>;
}
export function UserIcon(props: IconProps) {
  return <I {...props}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" /></I>;
}
export function ShieldIcon(props: IconProps) {
  return <I {...props}><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9.5 12l2 2 3.5-4" /></I>;
}
export function PlusIcon(props: IconProps) {
  return <I {...props}><path d="M12 5v14M5 12h14" /></I>;
}
export function PencilIcon(props: IconProps) {
  return <I {...props}><path d="M17 3a2.83 2.83 0 1 1 4 4L8 20l-5 1 1-5L17 3z" /></I>;
}
export function TrashIcon(props: IconProps) {
  return <I {...props}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-13M9 7V4h6v3" /></I>;
}
export function CheckIcon(props: IconProps) {
  return <I {...props}><path d="M5 13l4 4L19 7" /></I>;
}
export function XIcon(props: IconProps) {
  return <I {...props}><path d="M6 6l12 12M18 6L6 18" /></I>;
}
export function ChevronDownIcon(props: IconProps) {
  return <I {...props}><path d="M6 9l6 6 6-6" /></I>;
}
export function ChevronLeftIcon(props: IconProps) {
  return <I {...props}><path d="M15 6l-6 6 6 6" /></I>;
}
export function ChevronRightIcon(props: IconProps) {
  return <I {...props}><path d="M9 6l6 6-6 6" /></I>;
}
export function ArrowLeftIcon(props: IconProps) {
  return <I {...props}><path d="M15 6l-6 6 6 6" /></I>;
}
export function ArrowRightIcon(props: IconProps) {
  return <I {...props}><path d="M9 6l6 6-6 6" /></I>;
}
export function LogOutIcon(props: IconProps) {
  return <I {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></I>;
}
export function BellIcon(props: IconProps) {
  return <I {...props}><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 6-2.5 8h17C20.5 15 18 15 18 9z" /><path d="M10 21a2.5 2.5 0 0 0 4 0" /></I>;
}
export function InboxIcon(props: IconProps) {
  return <I {...props}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></I>;
}
export function TruckIcon(props: IconProps) {
  return <I {...props}><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 4v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></I>;
}
export function PackageIcon(props: IconProps) {
  return <I {...props}><path d="M12.89 1.45L2.4 7.9A1 1 0 0 0 1.85 9v6A1 1 0 0 0 2.4 16l10.49 6.55a1 1 0 0 0 1.02 0l10.49-6.55a1 1 0 0 0 .55-.9V9a1 1 0 0 0-.55-.9l-10.49-6.55a1 1 0 0 0-1.02 0z" /><path d="M20 9.35L12.49 4 2.49 9.35M2.49 9.35L12.49 15l10.01-5.65M12.49 22.53V15" /></I>;
}
export function WheatIcon(props: IconProps) {
  return <I {...props}><path d="M2 22c1.24-1.86 2.39-3.46 2.39-5.33a4.94 4.94 0 0 1 9.88 0c0 1.87 1.15 3.47 2.39 5.33" /><path d="M6.82 12.5c1.36-.29 2.6-1.15 3.44-2.4a4.9 4.9 0 0 1 3.5-2.1" /><path d="M13.33 12.9c2-.5 3.4-2.3 3.9-4.3 1.86.2 3.5-1.24 3.9-5.4C17.2 4 14.8 4.6 12.5 6c-1.1.7-2 1.9-2.4 3.4" /></I>;
}
export function AlertCircleIcon(props: IconProps) {
  return <I {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></I>;
}
export function CheckCircleIcon(props: IconProps) {
  return <I {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></I>;
}
export function CameraIcon(props: IconProps) {
  return <I {...props}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></I>;
}
export function GridIcon(props: IconProps) {
  return <I {...props}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></I>;
}
export function FlagIcon(props: IconProps) {
  return <I {...props}><path d="M4 22V4c3-2 6-2 9 0s6 2 9 0v12c-3 2-6 2-9 0s-6-2-9 0" /></I>;
}
export function UtensilsIcon(props: IconProps) {
  return <I {...props}><path d="M7 2v9a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2" /><path d="M9 13v9" /><path d="M17 2a7 7 0 0 0-4 6.3V13h4v9" /><path d="M17 2v11" /></I>;
}
export function ChevronsLeftIcon(props: IconProps) {
  return <I {...props}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></I>;
}
export function ChevronsRightIcon(props: IconProps) {
  return <I {...props}><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></I>;
}
export function MenuIcon(props: IconProps) {
  return <I {...props}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></I>;
}
export function InfoIcon(props: IconProps) {
  return <I {...props}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5" /><path d="M12 8h.01" /></I>;
}

/**
 * Verified-account badge. Unlike the stroke set above this one is a SOLID
 * seal, so it deliberately does not inherit currentColor — a verified tick
 * must always read as blue regardless of the surrounding text colour.
 * `title` supplies the accessible name; without it the mark is aria-hidden
 * (decorative, sitting next to the name it already labels).
 */
export function VerifiedBadgeIcon({ title, ...props }: IconProps & { title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#1D9BF0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.3-1.9-2.18-3.32-2.18s-2.66.88-3.32 2.18c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.66 1.3 1.9 2.18 3.32 2.18s2.66-.88 3.32-2.18c1.4.45 2.91.2 3.92-.81s1.26-2.52.8-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
      />
      <path
        fill="#FFFFFF"
        d="M10.16 16.32 6.1 12.26l1.44-1.44 2.62 2.62 6.3-6.3 1.44 1.44z"
      />
    </svg>
  );
}
