import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { HubCatalog } from '@/components/hub-catalog';
import { categories, first, type Params } from '@/lib/catalog';

export const metadata: Metadata = {title:'บัญชีข้อมูล'};
export default async function CatalogPage({searchParams}:{searchParams:Promise<Params>}) {
  const params=await searchParams;
  const rawCategory=first(params.category);
  const rawPage=first(params.page);
  const page=/^\d{1,5}$/.test(rawPage)?Math.max(1,Number(rawPage)):1;
  return <Shell active="catalog"><HubCatalog initialFilters={{
    q:first(params.q).slice(0,160),
    category:Object.hasOwn(categories,rawCategory)?rawCategory:'',
    sourceId:first(params.sourceId).slice(0,80),
    page,
  }}/></Shell>;
}
