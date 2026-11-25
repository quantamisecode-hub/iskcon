/** Friendly display name for the internal role enum values. */
export function displayRole(role: string | null | undefined): string {
  if (role === 'EVENT_CREATOR') return 'Event Creator';
  return role ?? '—';
}
