import { useEffect, useState } from 'react';
import { checkApiHealth } from '../services/api/health';
import { toApiRequestError } from '../services/api/apiClient';

export type ApiStatus = 'checking' | 'connected' | 'disconnected';

/** Alerts the UI whether the backend API is up. Used on the shell page. */
export function useApiHealth() {
  const [status, setStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        await checkApiHealth();
        if (!cancelled) setStatus('connected');
      } catch (error) {
        // Error details are logged for developers only (safe: no secrets in health check).
        const apiError = toApiRequestError(error);
        console.debug(`API health check failed: ${apiError.detail}`);
        if (!cancelled) setStatus('disconnected');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status };
}
