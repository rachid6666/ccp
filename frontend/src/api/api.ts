import axios from 'axios';

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const API_URL = rawApiUrl.replace(/\/$/, '').endsWith('/api')
  ? rawApiUrl.replace(/\/$/, '')
  : `${rawApiUrl.replace(/\/$/, '')}/api`;

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
});

function buildApiUrl(endpoint: string, params: Record<string, string>): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${API_URL}${normalizedEndpoint}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

export interface PreviewResponse {
  fileCount: number;
  totalLines: number;
  invalidLines: number;
  attemptedAmount: number;
  collectedAmount: number;
  failedAmount: number;
}

export interface UploadResponse {
  accessToken: string;
  sessionId: number;
}

export interface SessionResult {
  id: number;
  showroomName: string;
  wilaya: string | null;
  uploadedAt: string;
  fileCount: number;
  totalLines: number;
  invalidLines: number;
  attemptedAmount: number | string;
  collectedAmount: number | string;
  failedAmount: number | string;
  collectionRate: number | string;
  successCount: number;
  failedCount: number;
  uniqueClientCount: number;
  failedClientCount: number;
  followUpClientCount: number;
  riskyClientCount: number;
  blockCandidateCount: number;
}

async function downloadCsv(endpoint: string, token: string, filename: string): Promise<void> {
  const link = document.createElement('a');
  link.href = buildApiUrl(endpoint, { token });
  link.setAttribute('download', filename);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
}

export const apiService = {
  async previewFiles(files: File[]): Promise<PreviewResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const response = await api.post('/ccp/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async uploadFiles(
    files: File[],
    showroomName: string,
    phone: string | null,
    wilaya: string | null,
    consentAccepted: boolean,
    onProgress?: (progress: number) => void,
  ): Promise<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('showroomName', showroomName);
    if (phone) formData.append('phone', phone);
    if (wilaya) formData.append('wilaya', wilaya);
    formData.append('consentAccepted', String(consentAccepted));

    const response = await api.post('/ccp/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: progressEvent => {
        if (!onProgress || !progressEvent.total) return;
        onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
      },
    });
    return response.data;
  },

  async getSessionResult(token: string): Promise<SessionResult> {
    const response = await api.get('/ccp/result', {
      params: { token },
    });
    return response.data;
  },

  async downloadCsv(endpoint: string, token: string, filename: string): Promise<void> {
    return downloadCsv(endpoint, token, filename);
  },

  async downloadSummaryCsv(token: string): Promise<void> {
    return downloadCsv('/ccp/download/summary.csv', token, 'resume.csv');
  },

  async downloadFailedClientsCsv(token: string): Promise<void> {
    return downloadCsv(
      '/ccp/download/failed_clients.csv',
      token,
      'clients_echoues.csv',
    );
  },

  async downloadFollowUpCsv(token: string): Promise<void> {
    return downloadCsv('/ccp/download/follow_up.csv', token, 'clients_suivi.csv');
  },

  async downloadRiskyClientsCsv(token: string): Promise<void> {
    return downloadCsv(
      '/ccp/download/risky_clients.csv',
      token,
      'clients_risque.csv',
    );
  },

  async downloadBlockListCsv(token: string): Promise<void> {
    return downloadCsv('/ccp/download/block_list.csv', token, 'liste_blocage.csv');
  },

  async downloadAllCleanCsv(token: string): Promise<void> {
    return downloadCsv(
      '/ccp/download/all_clean.csv',
      token,
      'toutes_lignes_nettoyees.csv',
    );
  },
};
