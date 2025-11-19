// frontend/src/lib/recentSearchStore.ts

export type RecentSearch = {
  categoryLabel?: string;
  categoryValue?: string;
  location?: string;
  whenISO?: string | null;
  createdAt: string; // ISO string
};

const STORAGE_KEY = 'booka_recent_searches_v1';
const MAX_RECENT = 8;

function isBrowser() {
  return typeof window !== 'undefined';
}

function readRaw(): RecentSearch[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        ...item,
        createdAt: item.createdAt ?? new Date().toISOString(),
      }))
      .filter((item) => typeof item === 'object' && item !== null);
  } catch {
    return [];
  }
}

function writeRaw(items: RecentSearch[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota / private mode errors
  }
}

export function getRecentSearches(): RecentSearch[] {
  return readRaw();
}

type AddRecentSearchInput = {
  categoryLabel?: string;
  categoryValue?: string;
  location?: string;
  whenISO?: string | null;
};

export function addRecentSearch(input: AddRecentSearchInput) {
  const existing = readRaw();

  const key = `${input.categoryValue ?? ''}|${input.location ?? ''}|${
    input.whenISO ?? ''
  }`;

  const filtered = existing.filter((item) => {
    const itemKey = `${item.categoryValue ?? ''}|${item.location ?? ''}|${
      item.whenISO ?? ''
    }`;
    return itemKey !== key;
  });

  const next: RecentSearch[] = [
    {
      categoryLabel: input.categoryLabel,
      categoryValue: input.categoryValue,
      location: input.location,
      whenISO: input.whenISO ?? null,
      createdAt: new Date().toISOString(),
    },
    ...filtered,
  ].slice(0, MAX_RECENT);

  writeRaw(next);
}

