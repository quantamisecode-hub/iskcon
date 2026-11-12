import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <img src="/iskcon-logo.png" alt="ISKCON logo" className="h-20 w-auto" />
      <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-primary">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-secondary">
        The page you requested doesn&rsquo;t exist or was moved.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
      >
        Back to home
      </Link>
    </div>
  );
}
