// Minimal i18n helper with simple interpolation.
// Replace or extend with a full i18n solution if needed.

type Vars = Record<string, string | number | null | undefined>;

const dictionaries: Record<string, Record<string, string>> = {
  // Example: add overrides per locale here
  // 'en-ZA': {
  //   'quote.newFrom': 'New quote from {name}',
  // },
};

function getLocale(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang;
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en';
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(.*?)\}/g, (_, k) => {
    const v = vars[k.trim()];
    return v === null || v === undefined ? '' : String(v);
  });
}

export function t(key: string, fallback: string, vars?: Vars): string {
  const locale = getLocale();
  const dict = dictionaries[locale] || dictionaries[locale.split('-')[0]] || {};
  const template = dict[key] || fallback;
  return interpolate(template, vars);
}

