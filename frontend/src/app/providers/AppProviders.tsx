import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

/**
 * Wraps the application in every top-level provider.
 * Add future global providers (theme, data) here - never deep in pages.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
