import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

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

// Keep NWP API access tied to the exact resource row in the canonical registry.
const registry = JSON.parse(await readFile(new URL('../../config/resource_licenses.json', import.meta.url), 'utf8'));
const nwpResources = registry.resources.filter((resource) => resource.resource_key === 'tmd_hpc_nwp_d02_grid');
if (nwpResources.length !== 1) throw new Error('expected one tmd_hpc_nwp_d02_grid resource in the license registry');
const nwpResource = nwpResources[0];
const nwpLicenseApproved = nwpResource.license_status === 'approved_public';
const nwpPublicationApproved = nwpLicenseApproved && nwpResource.project_publication_approved === true &&
  !(Array.isArray(nwpResource.unresolved) ? nwpResource.unresolved.length : nwpResource.unresolved);
await writeFile(new URL('../lib/hub/nwp-resource-license.ts', import.meta.url), `/** Generated from config/resource_licenses.json by prepare-data.mjs. */\nexport const NWP_RESOURCE_LICENSE = ${JSON.stringify({
  resource_key: nwpResource.resource_key,
  license_status: nwpResource.license_status,
  project_publication_approved: nwpResource.project_publication_approved === true,
  access_status: nwpPublicationApproved ? 'approved_public' : 'metadata_only',
}, null, 2)} as const;\n`);
