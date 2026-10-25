import type { ApiMeta } from './types';

export function catalogSyncCompleteness(statuses: Array<string | null | undefined>): ApiMeta['completeness'] {
  if (statuses.some((status) => status === 'partial' || status === 'failed' || status === 'running')) return 'partial';
  return statuses.length && statuses.every((status) => status === 'succeeded') ? 'complete' : 'unknown';
}
