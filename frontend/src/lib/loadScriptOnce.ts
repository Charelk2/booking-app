const scriptPromises = new Map<string, Promise<void>>();

export function loadScriptOnce(id: string, src: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const existingEl = document.getElementById(id);
  if (existingEl) return Promise.resolve();

  const existing = scriptPromises.get(id);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.id = id;
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });

  scriptPromises.set(id, promise);
  return promise;
}

