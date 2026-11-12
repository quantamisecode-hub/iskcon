import { Link } from 'react-router-dom';

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-danger">403</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-secondary">
        You don&rsquo;t have permission to view this page. Ask an administrator if you
        believe this is a mistake.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
      >
        Back to home
      </Link>
    </div>
  );
}
