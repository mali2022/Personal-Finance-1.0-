import { apiClient, setAccessToken } from './client';
import type { ApiResponse } from '../types';
export interface Profile {
  id: string;
  email: string;
  displayName: string;
  realName: string;
  phone: string;
  birthday: string | null;
  gender: 'Unspecified' | 'Female' | 'Male' | 'Other';
  country: string;
  region: string;
  city: string;
  occupation: string;
  bio: string;
  language: 'zh-CN' | 'en';
  timeZone: string;
  preferredCurrency: string;
  createdAt: string;
  version: number;
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
}
// Sensitive requests deliberately omit Idempotency-Key: their bodies must never enter the browser operation journal.
async function csrf() {
  await apiClient.get('/auth/csrf');
}
export const profileApi = {
  get: () =>
    apiClient
      .get<ApiResponse<Profile>>('/auth/profile')
      .then((r) => r.data.data),
  save: async (body: Profile) => {
    await csrf();
    return apiClient
      .put<ApiResponse<Profile>>('/auth/profile', body, {
        headers: { 'If-Match': String(body.version) },
      })
      .then((r) => r.data.data);
  },
  avatar: () =>
    apiClient
      .get<Blob>('/auth/avatar', { responseType: 'blob' })
      .then((r) => r.data),
  upload: async (file: File, version: number) => {
    await csrf();
    return apiClient
      .put<ApiResponse<Profile>>('/auth/avatar', file, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'If-Match': String(version),
        },
      })
      .then((r) => r.data.data);
  },
  remove: async (version: number) => {
    await csrf();
    return apiClient
      .delete<ApiResponse<Profile>>('/auth/avatar', {
        headers: { 'If-Match': String(version) },
      })
      .then((r) => r.data.data);
  },
  password: async (body: { currentPassword: string; newPassword: string }) => {
    await csrf();
    await apiClient.post('/auth/password', body);
    setAccessToken();
  },
};
