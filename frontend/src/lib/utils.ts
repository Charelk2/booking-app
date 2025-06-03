import api from './api';

export const getFullImageUrl = (relativePath: string | undefined | null): string | null => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const cleanPath = relativePath.startsWith('/static/') ? relativePath : `/static/${relativePath.replace(/^\/+/, '')}`;
  return `${api.defaults.baseURL}${cleanPath}`;
};
