import { Shell } from '@/components/shell';
import { DataExplorer } from '@/components/data-explorer';
import { PriceTrend } from '@/components/price-trend';
import { first, type Params } from '@/lib/catalog';

export const metadata = { title: 'สำรวจข้อมูล' };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const dataset = first(params.dataset).slice(0, 120);
  const q = first(params.q).slice(0, 160);
  const page = /^[1-9]\d{0,4}$/.test(first(params.page)) ? first(params.page) : '1';

  return <Shell active="explore">
    <div className="page-heading">
      <div>
        <h1>สำรวจข้อมูล</h1>
        <p>ค้นชุดข้อมูลจาก API แล้วเปิดแถวตัวเลขเฉพาะทรัพยากรที่ Hub อนุมัติให้เผยแพร่</p>
      </div>
    </div>
    {first(params.view) === 'price_trend'
      ? <PriceTrend key={JSON.stringify({ dataset, resourceId: first(params.resourceId), series: first(params.series), from: first(params.from), to: first(params.to) })} dataset={dataset} resourceId={first(params.resourceId).slice(0, 120)} series={first(params.series).slice(0, 120)} from={first(params.from).slice(0, 7)} to={first(params.to).slice(0, 7)}/>
      : <DataExplorer key={dataset + q + page} dataset={dataset} q={q} page={page}/>}
  </Shell>;
}
