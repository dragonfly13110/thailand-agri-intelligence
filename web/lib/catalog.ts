export const categories = {
  crops: 'พืชและการผลิต', prices: 'ราคาและตลาด', water: 'น้ำ อากาศ และภัย',
  land: 'ดิน พื้นที่ และดาวเทียม', fisheries: 'ประมง', livestock: 'ปศุสัตว์',
} as const;
export type Category = keyof typeof categories;
export type CatalogRecord = {
  id: string; resource_key: string; title: string; description: string;
  source_label: string; source_url: string; category: Category;
  grain: string; period: string | null; unit: string | null;
  metadata_review: 'project_authored_public';
  data_license_status: 'pending' | 'restricted' | 'approved_public';
};
export type Catalog = { schema_version: 1; reviewed_at: string; review_scope: 'project_authored_descriptions_only'; records: CatalogRecord[] };
export type Params = Record<string, string | string[] | undefined>;
const textFields = ['id', 'resource_key', 'title', 'description', 'source_label', 'source_url', 'category', 'grain', 'metadata_review', 'data_license_status'];

export function validateCatalog(value: unknown): Catalog {
  if (!value || typeof value !== 'object') throw new Error('Invalid catalog');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 4 || data.schema_version !== 1 || data.review_scope !== 'project_authored_descriptions_only' ||
      typeof data.reviewed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.reviewed_at) ||
      !Array.isArray(data.records) || data.records.length > 100) throw new Error('Invalid catalog');
  const seen = new Set<string>();
  for (const row of data.records) {
    if (!row || typeof row !== 'object' || Object.keys(row).length !== 12 ||
        !textFields.every(k => typeof row[k] === 'string' && row[k].length > 0 && row[k].length <= 800) ||
        !['period', 'unit'].every(k => row[k] === null || (typeof row[k] === 'string' && row[k].length <= 200)) ||
        !/^[a-z][a-z0-9-]{1,79}$/.test(row.id) || seen.has(row.id) ||
        row.metadata_review !== 'project_authored_public' || !Object.hasOwn(categories, row.category) ||
        !['pending', 'restricted', 'approved_public'].includes(row.data_license_status)) throw new Error('Unreviewed catalog');
    const url = new URL(row.source_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Unsafe source');
    seen.add(row.id);
  }
  return value as Catalog;
}

export function first(value: string | string[] | undefined) { return (Array.isArray(value) ? value[0] : value) ?? ''; }

export function selectCatalog(records: CatalogRecord[], params: Params) {
  const q = first(params.q).normalize('NFC').trim().slice(0, 160);
  const rawCategory = first(params.category);
  const category = Object.hasOwn(categories, rawCategory) ? rawCategory as Category : '';
  const source = first(params.source).slice(0, 160);
  const filtered = records.filter(row =>
    (!category || row.category === category) && (!source || row.source_label === source) &&
    (!q || [row.title, row.description, row.source_label, row.grain].join(' ').normalize('NFC').toLocaleLowerCase('th').includes(q.toLocaleLowerCase('th'))));
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const rawPage = first(params.page);
  const page = /^\d{1,5}$/.test(rawPage) ? Math.min(pages, Math.max(1, Number(rawPage))) : 1;
  return {q, category, source, page, pages, total: filtered.length, records: filtered.slice((page - 1) * 6, page * 6)};
}

export function catalogHref(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  return '/catalog' + (query.size ? '?' + query.toString() : '');
}

export function thaiDate(date: string) {
  return new Intl.DateTimeFormat('th-TH', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'}).format(new Date(date + 'T00:00:00Z'));
}
