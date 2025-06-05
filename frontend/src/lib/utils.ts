import api from './api';

export const getFullImageUrl = (relativePath: string | undefined | null): string | null => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const cleanPath = relativePath.startsWith('/static/') ? relativePath : `/static/${relativePath.replace(/^\/+/, '')}`;
  return `${api.defaults.baseURL}${cleanPath}`;
};

export const extractErrorMessage = (detail: unknown): string => {
  if (!detail) return 'An unexpected error occurred.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === 'object' && d && 'msg' in d) {
          const record = d as Record<string, unknown>;
          return record.msg as string;
        }
        return JSON.stringify(d);
      })
      .join(', ');
  }
  if (typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    if (typeof record.msg === 'string') return record.msg;
    return JSON.stringify(detail);
  }
  return String(detail);
};
