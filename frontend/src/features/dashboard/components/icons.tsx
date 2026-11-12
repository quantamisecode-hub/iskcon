import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base() {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v10" />
    </svg>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4a3 3 0 0 1 6 0" />
      <path d="M9 11l2 2 4-4" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 10v5" />
      <path d="M12 18h.01" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

export function TrendIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M4 19l6-6 4 4 6-9" />
      <path d="M15 8h5v5" />
    </svg>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 6-2.5 8h17C20.5 15 18 15 18 9z" />
      <path d="M10 21a2.5 2.5 0 0 0 4 0" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M20 11A8 8 0 1 0 12 20" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.5 3-5.5 6.5-5.5S15.5 16.5 15.5 20" />
      <circle cx="17" cy="9" r="2.8" />
      <path d="M15.5 14.7c3 .3 6 2 6 5.3" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base()} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
