declare module 'cloudflare:workers' {
  export const env: {
    DB?: import('../lib/hub/d1').D1Database;
    ASSETS?: unknown;
    [key: string]: unknown;
  };
}
