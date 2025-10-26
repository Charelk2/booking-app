export const VIRTUALIZATION_THRESHOLD = 100000;

export function selectAdapter(messageCount: number): 'plain' | 'virtuoso' {
  return messageCount > VIRTUALIZATION_THRESHOLD ? 'virtuoso' : 'plain';
}
