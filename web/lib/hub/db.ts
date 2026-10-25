import 'server-only';
import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | undefined;

export class HubDatabaseError extends Error {
  constructor(readonly code: 'HUB_DATABASE_NOT_CONFIGURED' | 'HUB_DATABASE_CONFIGURATION_INVALID' | 'HUB_DATABASE_UNAVAILABLE') {
    super(code);
  }
}

function connectionString() {
  const value = process.env.TADIH_DATABASE_URL;
  if (!value) throw new HubDatabaseError('HUB_DATABASE_NOT_CONFIGURED');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HubDatabaseError('HUB_DATABASE_CONFIGURATION_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new HubDatabaseError('HUB_DATABASE_CONFIGURATION_INVALID');
  }
  const isSupabase = url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com');
  if (isSupabase && (url.port !== '6543' || url.searchParams.get('sslmode') !== 'require')) {
    throw new HubDatabaseError('HUB_DATABASE_CONFIGURATION_INVALID');
  }
  return value;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 4_000,
      statement_timeout: 8_000,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  try {
    const result = await getPool().query<T>(text, values);
    return result.rows;
  } catch (error) {
    if (error instanceof HubDatabaseError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
    if (code.startsWith('08') || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '53300', '57P03'].includes(code)) {
      throw new HubDatabaseError('HUB_DATABASE_UNAVAILABLE');
    }
    throw error;
  }
}

import { getD1, hasD1Catalog } from './d1';

export async function hasDatabase(): Promise<boolean> {
  if (await hasD1Catalog()) {
    return true;
  }
  return Boolean(process.env.TADIH_DATABASE_URL);
}

export async function hasNumericDatabase(): Promise<boolean> {
  if (Boolean(process.env.TADIH_DATABASE_URL)) {
    return true;
  }
  if (await hasD1Catalog()) {
    try {
      const d1 = await getD1();
      if (!d1) return false;
      const row = await d1
        .prepare("SELECT count(*) AS total FROM resources WHERE project_publication_approved = 1 AND access_status = 'approved_public'")
        .first<{ total: number | string }>();
      return Number(row?.total ?? 0) > 0;
    } catch {
      return false;
    }
  }
  return false;
}

export async function getDatabaseKind(): Promise<'d1' | 'postgres' | 'none'> {
  if (await hasD1Catalog()) {
    return 'd1';
  }
  if (process.env.TADIH_DATABASE_URL) {
    return 'postgres';
  }
  return 'none';
}
