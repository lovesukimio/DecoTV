export const DEFAULT_PANSOU_SERVER_URL = 'https://pansou.katelya.eu.org/';

export interface PanSouRuntimeConfig {
  serverUrl: string;
  token: string;
}

export function normalizePanSouServerUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\/+$/, '');
}

export function normalizePanSouToken(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export function getDefaultPanSouConfig(): PanSouRuntimeConfig {
  return {
    serverUrl: normalizePanSouServerUrl(DEFAULT_PANSOU_SERVER_URL),
    token: '',
  };
}

export function resolvePanSouSearchUrl(serverUrl: string): string {
  const normalized = normalizePanSouServerUrl(serverUrl);
  if (/\/api\/search$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/api/search`;
}

export function resolvePanSouHealthUrl(serverUrl: string): string {
  const normalized = normalizePanSouServerUrl(serverUrl);
  if (/\/api\/search$/i.test(normalized)) {
    return normalized.replace(/\/api\/search$/i, '/api/health');
  }
  if (/\/api$/i.test(normalized)) {
    return `${normalized}/health`;
  }
  return `${normalized}/api/health`;
}
