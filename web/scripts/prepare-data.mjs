import { copyFile } from 'node:fs/promises';

// Keep the public 77-province reference inside the web build root; no private data is copied.
await copyFile(new URL('../../config/provinces.csv',import.meta.url),new URL('../data/provinces.csv',import.meta.url));
