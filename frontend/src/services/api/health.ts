import { API_ENDPOINTS } from '../../constants/apiEndpoints';
import { apiClient } from './apiClient';

interface HealthData {
  status: string;
}

/** Calls GET /api/v1/health to verify the backend is reachable. */
export async function checkApiHealth(): Promise<HealthData> {
  const response = await apiClient.get<{ success: boolean; data: HealthData; message?: string }>(
    API_ENDPOINTS.health,
  );
  return response.data.data;
}
