import { apiClient } from '../../api/client';
import type { FuelRow } from './api';
export interface FuelBulkRequest {
  action: 'Delete' | 'Restore' | 'SetTankStatus';
  targets: { id: string; version: string }[];
  tankStatus?: string;
  fullTankConfirmed?: boolean;
}
export const fuelBulkApi = {
  apply: async (body: FuelBulkRequest, key: string) =>
    (
      await apiClient.post<{ data: { count: number; action: string } }>(
        '/fuel/records/bulk',
        body,
        { headers: { 'Idempotency-Key': key } },
      )
    ).data.data,
  trash: async (page = 1) =>
    (
      await apiClient.get<{
        data: { records: FuelRow[]; total: number; limit: number };
      }>('/fuel/records/trash', { params: { page } })
    ).data.data,
};
