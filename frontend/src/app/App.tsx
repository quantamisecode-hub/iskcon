import { AppRoutes } from './routes';
import { AppProviders } from './providers/AppProviders';

export function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
