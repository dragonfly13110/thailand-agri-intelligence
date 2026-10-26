import { copyFile, mkdir } from 'node:fs/promises';

// Keep the public 77-province reference inside the web build root; no private data is copied.
await copyFile(new URL('../../config/provinces.csv',import.meta.url),new URL('../data/provinces.csv',import.meta.url));

// Generated public copy of the NWP risk thresholds. These thresholds are TADIH internal
// decision aids, not official TMD warnings; the canonical file lives in config/ and is read
// by the Python pipeline. Missing source fails the prebuild on purpose (no silent fallback).
await mkdir(new URL('../data', import.meta.url), { recursive: true });
await copyFile(
  new URL('../../config/nwp_thresholds.json', import.meta.url),
  new URL('../data/nwp-thresholds.json', import.meta.url),
);
