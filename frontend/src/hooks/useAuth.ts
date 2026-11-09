import { useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext';

/** Typed access to the authentication context (Phase 2 will implement login/logout). */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return useMemo(() => context, [context]);
}
