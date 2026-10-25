import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import { HubDatasetDetail } from '@/components/hub-catalog';

export const metadata: Metadata = {title:'รายละเอียดชุดข้อมูล'};
export const dynamic = 'force-dynamic';
export default async function DetailPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <Shell active="catalog"><HubDatasetDetail id={decodeURIComponent(id)}/></Shell>;
}
