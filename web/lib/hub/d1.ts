import 'server-only';

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
  error?: string;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  dump(): Promise<ArrayBuffer>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

let cachedD1: D1Database | null | undefined;

/**
 * Creates an HTTP-based D1 client wrapper using Cloudflare D1 REST API.
 * This allows querying the remote D1 database from standard Node.js environments (Next.js dev, scripts, tests).
 */
function createHttpD1Client(accountId: string, databaseId: string, apiToken: string): D1Database {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function execute<T>(sql: string, params: unknown[] = []): Promise<D1Result<T>> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`D1 HTTP query failed with status ${res.status}: ${errBody}`);
    }

    const payload = (await res.json()) as {
      result?: Array<{ results?: T[]; success: boolean; meta?: Record<string, unknown>; error?: string }>;
      success: boolean;
      errors?: Array<{ message: string }>;
    };

    if (!payload.success || !payload.result?.[0]) {
      const msg = payload.errors?.map((e) => e.message).join(', ') || 'Unknown D1 REST error';
      throw new Error(`D1 HTTP query error: ${msg}`);
    }

    const first = payload.result[0];
    return {
      results: first.results ?? [],
      success: first.success,
      meta: first.meta ?? {},
      error: first.error,
    };
  }

  return {
    prepare(query: string): D1PreparedStatement {
      let boundParams: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          boundParams = values;
          return stmt;
        },
        async all<T = unknown>() {
          return execute<T>(query, boundParams);
        },
        async first<T = unknown>(colName?: string) {
          const res = await execute<Record<string, unknown>>(query, boundParams);
          const row = res.results[0];
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as unknown as T;
        },
        async raw<T = unknown>() {
          const res = await execute<T>(query, boundParams);
          return res.results;
        },
      };
      return stmt;
    },
    async dump() {
      throw new Error('D1 dump is not supported over HTTP client');
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const results: D1Result<T>[] = [];
      for (const stmt of statements) {
        results.push(await stmt.all<T>());
      }
      return results;
    },
    async exec(query: string) {
      const res = await execute(query);
      return { count: res.results.length, duration: 0 };
    },
  };
}

/**
 * Resolves the active D1 database handle.
 * 1. Checks workerd native `cloudflare:workers` module via dynamic import.
 * 2. Checks global / process environment for direct bindings.
 * 3. Checks Cloudflare API environment variables for HTTP REST fallback.
 */
export async function getD1(): Promise<D1Database | null> {
  if (cachedD1 !== undefined) {
    return cachedD1;
  }

  // 1. Try native workerd binding via 'cloudflare:workers'
  try {
    // Direct dynamic import allows @cloudflare/vite-plugin to externalize for workerd runtime
    const mod = await import('cloudflare:workers').catch(() => null);
    const db = (mod as { env?: { DB?: D1Database } })?.env?.DB;
    if (db && typeof db.prepare === 'function') {
      cachedD1 = db as D1Database;
      return cachedD1;
    }
  } catch {
    // Not running inside workerd
  }

  // 2. Try globalThis.env?.DB or process.env.DB
  const globalEnv = (globalThis as unknown as { env?: { DB?: D1Database } })?.env;
  if (globalEnv?.DB && typeof globalEnv.DB.prepare === 'function') {
    cachedD1 = globalEnv.DB;
    return cachedD1;
  }

  // 3. Try HTTP REST client if credentials are configured in environment
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    'e00f22a8994eaa5a08e0ec523f64a14d';
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    process.env.CF_D1_TOKEN ||
    process.env.TADIH_D1_TOKEN;
  const databaseId =
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.CF_D1_DATABASE_ID ||
    'c95fd817-4a46-4303-b008-382f7e82c4dc';

  if (accountId && apiToken && databaseId) {
    try {
      cachedD1 = createHttpD1Client(accountId, databaseId, apiToken);
      return cachedD1;
    } catch {
      // REST client creation failed
    }
  }

  cachedD1 = null;
  return null;
}

/**
 * Execute a query against D1 SQLite, returning typed row array.
 */
export async function queryD1<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d1 = await getD1();
  if (!d1) {
    throw new Error('D1 database is not available');
  }
  const result = await d1.prepare(sql).bind(...params).all<T>();
  return result.results;
}

/**
 * Checks whether D1 is connected and contains synchronized catalog records.
 * Returns true only if D1 is reachable and has datasets or sources ready to serve.
 */
export async function hasD1Catalog(): Promise<boolean> {
  try {
    const d1 = await getD1();
    if (!d1) return false;

    // Check if datasets table has any approved/metadata_only records
    const row = await d1
      .prepare("SELECT count(*) AS total FROM datasets WHERE metadata_access_status IN ('approved_public', 'metadata_only')")
      .first<{ total: number | string }>();

    const total = Number(row?.total ?? 0);
    return total > 0;
  } catch {
    return false;
  }
}
