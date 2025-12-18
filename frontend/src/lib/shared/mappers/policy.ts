export type SanitizedPolicy = {
  intro: string;
  bullets: string[];
};

const POLICY_LEVEL_RE = /^(flexible|moderate|strict)$/i;
const POLICY_HEADING_RE = /^\s*#+\s*(flexible|moderate|strict)\b.*$/i;
const BULLET_RE = /^\s*(?:[-*•])\s+(.+)\s*$/;

export function sanitizeCancellationPolicy(raw?: string | null): SanitizedPolicy {
  if (!raw) return { intro: '', bullets: [] };

  const lines = String(raw).split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (POLICY_HEADING_RE.test(trimmed)) return false;
    if (POLICY_LEVEL_RE.test(trimmed)) return false;
    return true;
  });

  const bullets: string[] = [];
  const introParts: string[] = [];

  for (const line of filtered) {
    const bulletMatch = line.match(BULLET_RE);
    if (bulletMatch?.[1]) {
      bullets.push(bulletMatch[1].trim());
      continue;
    }

    if (line.trim()) introParts.push(line.trim());
  }

  return { intro: introParts.join(' '), bullets };
}

