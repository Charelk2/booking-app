import api from './api';

export const getFullImageUrl = (relativePath: string | undefined | null): string | null => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const cleanPath = relativePath.startsWith('/static/') ? relativePath : `/static/${relativePath.replace(/^\/+/, '')}`;
  return `${api.defaults.baseURL}${cleanPath}`;
};

export const extractErrorMessage = (detail: any): string => {
  if (!detail) return 'An unexpected error occurred.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg ?? JSON.stringify(d)).join(', ');
  }
  if (typeof detail === 'object') {
    return detail.msg ?? JSON.stringify(detail);
  }
  return String(detail);
};
