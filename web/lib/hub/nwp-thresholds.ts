/**
 * Bundled copy of `config/nwp_thresholds.json`.
 *
 * The worker runtime (`vinext-cloudflare deploy`) has no file system, so the
 * disk copy in `web/data/` cannot be read in production and every province
 * would fall back to `riskLevel: null`. This module is the build-time copy
 * that travels inside the bundle.
 *
 * `web/tests/nwp-thresholds.test.ts` asserts that this object is deep-equal to
 * `config/nwp_thresholds.json`, so the two cannot drift.
 */

import type { NwpThresholds } from './nwp-types';

export const BUNDLED_NWP_THRESHOLDS: NwpThresholds = {
  version: 1,
  source: 'TADIH internal thresholds; not official TMD warnings',
  variables: {
    p24h: { unit: 'mm', watch: 20, high: 50, severe: 90 },
    p1h: { unit: 'mm', watch: 10, high: 20, severe: 30 },
    t2m: { unit: 'degC', watch: 35, high: 38, severe: 40 },
    rhum: { unit: '%', watch: 85, high: 90, severe: 95 },
    ws10m: { unit: 'm/s', watch: 6, high: 10, severe: 15 },
  },
};
