import { useState } from 'react';
import { formToAuthError } from '../utils/formToAuthError';

/** Typed error for login form failures (already user-safe). */
export interface LoginError {
  message: string;
}

/** Wraps useAuth().login with local loading + error state for the login form. */
export function useLoginSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);

  async function run(
    login: (email: string, password: string) => Promise<unknown>,
    email: string,
    password: string,
  ): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      return true;
    } catch (caught) {
      setError(formToAuthError(caught));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, error, run };
}
