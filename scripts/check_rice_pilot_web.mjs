import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const base='http://127.0.0.1:3123',publicBase='http://127.0.0.1:3124';
const route='/areas/73/rice',api='/api/local-data?dataset=short-crop-production&view=rice_pilot';
const folder=resolve('data/local/probes/web-rice-pilot-v1');
await mkdir(folder,{recursive:true});
const report={checked_at:new Date().toISOString(),checks:[],errors:[],screenshots:[]};
const browser=await chromium.launch({headless:true});
const rawCheck=`from pathlib import Path
from decimal import Decimal
from collections import defaultdict
import json,hashlib
from tadih.prices import load_nabc_monthly_snapshot
from tadih.catalog import ROOT
production=next((ROOT/'data/local/production/staged').glob('*/records.jsonl'))
rows=[json.loads(s) for s in production.read_text(encoding='utf-8').splitlines()]
selected=[r for r in rows if r['province_name']=='นครปฐม' and r['crop_type']=='ข้าวนาปี' and r['year_ad']==2023]
next_year=[r for r in rows if r['province_name']=='นครปฐม' and r['crop_type']=='ข้าวนาปี' and r['year_ad']==2024]
product='ข้าวเปลือกเจ้าปทุมธานี 1 ความชื้น 15'
capture=load_nabc_monthly_snapshot(ROOT/'data/local/raw/oae'/('monthly-product-'+hashlib.sha256(product.encode()).hexdigest()[:24]))
prices={}
for row in capture['payload']['data']:
 if int(row['year_th'])==2566:
  month='2023-'+str(int(row['month'])).zfill(2)
  assert row['province_code']=='TH00' and int(row['week'])==0 and month not in prices
  value=Decimal(str(row['value']).replace(',',''))
  assert row['unit'] in ('บาท/ตัน','บาท/กก.')
  prices[month]=float(value/1000 if row['unit']=='บาท/ตัน' else value)
directory=ROOT/'data/local/raw/open_meteo/era5-13.8-100.25-2023'
manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
artifact=(directory/manifest['artifact']).read_bytes()
envelope=json.loads(artifact)
assert manifest['checksum_basis']=='canonical_json_utf8'
assert hashlib.sha256(json.dumps(envelope,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()==manifest['checksum']
payload=envelope['payload'];rain=defaultdict(lambda:Decimal(0));days=defaultdict(int)
assert payload['daily_units']['precipitation_sum']=='mm' and payload['timezone']=='Asia/Bangkok'
for day,value in zip(payload['daily']['time'],payload['daily']['precipitation_sum']):
 assert value is not None
 rain[day[:7]]+=Decimal(str(value));days[day[:7]]+=1
print(json.dumps(dict(rows=selected,next_year_rows=len(next_year),prices=prices,rain={k:float(v) for k,v in rain.items()},days=dict(days),raw_sha256=manifest['checksum'],requested=envelope['requested_location'],provider=dict(latitude=payload['latitude'],longitude=payload['longitude'])),ensure_ascii=False))`;
const listen=page=>{page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))report.errors.push(message.text());});};
async function capture(page,name){
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page horizontal overflow');
  await page.screenshot({path:resolve(folder,name),fullPage:true});report.screenshots.push(name);
}
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();listen(page);
  assert.equal((await (await context.request.get(base+api)).json()).state,'locked');
  assert.equal((await (await context.request.get(publicBase+api)).json()).state,'disabled');
  await page.goto(base+route+'?year=2023',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'เปิดกรณีข้าวนครปฐม',exact:true}).click();
  await page.locator('.pilot-production-summary').waitFor();
  assert.ok(page.url().includes('/areas/73/rice?year=2023'));
  const initial=await (await context.request.get(base+api+'&year=2023')).json();
  assert.equal(initial.state,'ready');assert.equal(initial.production.matched_rows,97);
  assert.equal(initial.production.snapshot_matched_rows,97);
  assert.equal(initial.production.completeness.production_kg.missing_rows,1);
  assert.equal(initial.production.completeness.damaged_area_rai.missing_rows,97);
  assert.ok((await page.locator('.pilot-data-readiness').innerText()).includes('ยังไม่ทราบทั้ง 97 แถว'));
  assert.equal(await page.locator('.pilot-data-readiness a').getAttribute('href'),'#production-checks');
  assert.equal(initial.price.selection_required,true);assert.equal(initial.price.series_options.length,3);
  assert.ok(!Object.hasOwn(initial.price,'points'));assert.ok(!Object.hasOwn(initial.price,'selected'));
  assert.equal(await page.locator('#pilot-price svg').count(),0);
  assert.ok(Object.values(initial.gates).every(value=>value===false));
  assert.ok(!JSON.stringify(initial).includes('data/local/'));
  report.checks.push('session returns to fixed pilot; real production counts/missing/snapshot references; no implicit price choice; all six join/release gates closed');
  const raw=JSON.parse(execFileSync(resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-X','utf8','-c',rawCheck],{encoding:'utf8',windowsHide:true}));
  assert.equal(raw.rows.length,initial.production.matched_rows);
  for(const [index,row] of initial.production.table.rows.entries())for(const {key} of initial.production.table.columns)
    assert.equal(row[key],raw.rows[index][key]);
  const choice=initial.price.series_options.find(option=>option.label==='ข้าวเปลือกเจ้าปทุมธานี 1 ความชื้น 15');assert.ok(choice);
  await page.getByLabel('บริบทราคาประเทศ (เลือกเอง)',{exact:true}).selectOption(choice.id);
  await page.getByRole('button',{name:'เปิดบริบทที่เลือก',exact:true}).click();
  await page.waitForURL('**series='+choice.id);
  await page.locator('.pilot-price-line').waitFor();
  const selected=await (await context.request.get(base+api+'&year=2023&series='+choice.id)).json();
  assert.equal(selected.price.selection_required,false);assert.equal(selected.price.selected.spatial_support,'national');
  assert.equal(selected.price.selected.unit,'THB/kg');assert.equal(selected.price.points.length,12);
  for(const point of selected.price.points)assert.ok(Math.abs(point.value-raw.prices[point.month])<1e-10);
  assert.deepEqual(selected.rainfall.requested_coordinates,raw.requested);
  assert.deepEqual(selected.rainfall.provider_grid_coordinates,raw.provider);
  assert.equal(selected.rainfall.source_sha256,raw.raw_sha256);
  assert.equal(selected.rainfall.months.length,12);
  for(const row of selected.rainfall.months){assert.equal(row.status,'available');assert.equal(row.present_days,raw.days[row.month]);assert.ok(Math.abs(row.rainfall_mm-raw.rain[row.month])<1e-9);}
  assert.equal(await page.locator('.pilot-rain-bar').count(),12);
  const chartLabels=await page.locator('.pilot-chart text').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)*node.getBoundingClientRect().width/Math.max(1,node.getBBox().width)));
  assert.ok(chartLabels.every(size=>size>=11.9),'chart labels render below 12 CSS pixels');
  const renderedRain=await page.locator('#pilot-rain .data-table').innerText();
  const format=new Intl.NumberFormat('th-TH',{maximumFractionDigits:6});
  for(const row of selected.rainfall.months)assert.ok(renderedRain.includes(format.format(row.rainfall_mm)));
  assert.ok((await page.locator('.pilot-coordinates').innerText()).includes('13.75'));
  assert.ok((await page.locator('.pilot-time-note').innerText()).includes('ยังไม่ยืนยัน'));
  await capture(page,'desktop.png');
  await page.screenshot({path:resolve(folder,'desktop-top.png')});report.screenshots.push('desktop-top.png');
  report.checks.push('25 production cells match independent JSONL scan; explicit rice choice and all 12 prices match raw capture; 12 rainfall sums/day counts/coordinates/checksum match independent raw Decimal sums');
  await page.getByRole('link',{name:'ถัดไป',exact:true}).click();await page.waitForURL('**page=2');
  await page.locator('.pilot-production-summary').waitFor();
  assert.equal(await page.getByLabel('บริบทราคาประเทศ (เลือกเอง)',{exact:true}).inputValue(),choice.id);
  const second=await (await context.request.get(base+api+'&year=2023&series='+choice.id+'&page=2')).json();
  for(const [index,row] of second.production.table.rows.entries())for(const {key} of second.production.table.columns)assert.equal(row[key],raw.rows[index+25][key]);
  await page.reload({waitUntil:'networkidle'});await page.locator('.pilot-production-summary').waitFor();
  assert.ok(page.url().includes('page=2'));
  await page.getByLabel('ฉลากปีการผลิต (พ.ศ.)',{exact:true}).selectOption('2024');
  await page.getByRole('button',{name:'เปิดบริบทที่เลือก',exact:true}).click();await page.waitForURL('**year=2024**');
  await page.locator('.pilot-production-summary').waitFor();
  const next=await (await context.request.get(base+api+'&year=2024&series='+choice.id)).json();
  assert.equal(next.production.matched_rows,raw.next_year_rows);assert.equal(next.production.table.page,1);
  if(!raw.next_year_rows)assert.equal(await page.locator('.pilot-data-readiness').count(),0);
  assert.equal(next.rainfall.months[1].expected_days,29);assert.equal(next.rainfall.months[1].present_days,29);
  report.checks.push('pagination and reload preserve case/price; changing source-year resets page and leap-year rainfall calendar remains correct');
  for(const suffix of ['&year=2566','&year=2023&province='+encodeURIComponent('นครปฐม'),'&year=2023&from=2023-01','&year=2023&page=0'])assert.equal((await context.request.get(base+api+suffix)).status(),400);
  const forged=await context.request.get(base+api,{headers:{cookie:'tadih_local_session='+'0'.repeat(64)}});assert.equal((await forged.json()).state,'locked');
  const cross=await context.request.get(base+api,{headers:{origin:'https://evil.invalid','sec-fetch-site':'cross-site'}});assert.equal((await cross.json()).state,'disabled');
  const denied=await context.request.post(base+'/api/local-session?dataset=short-crop-production&view=rice_pilot&return=rice-pilot&year=2566',{headers:{origin:base}});assert.equal(denied.status(),400);
  const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/local-data')requests.push(request.url());});
  await page.goto(base+route+'?year=2566',{waitUntil:'networkidle'});
  assert.ok(await page.getByRole('heading',{name:'ตัวกรองกรณีนำร่องไม่ถูกต้อง',exact:true}).isVisible());assert.deepEqual(requests,[]);
  const publicPage=await context.newPage();listen(publicPage);await publicPage.goto(publicBase+route,{waitUntil:'networkidle'});
  assert.equal(await publicPage.locator('.rice-pilot').count(),0);
  report.checks.push('invalid filters/year/page HTTP400, invalid page performs no numeric read; forged/cross-origin/public modes cannot access pilot; session rejects invalid return context');
  for(const [name,width,height] of [['mobile',390,844],['user',693,654]]) {
    const screen=await browser.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});
    const device=await screen.newPage();listen(device);
    await device.goto(base+route+'?year=2023&series='+choice.id,{waitUntil:'networkidle'});
    await device.getByRole('button',{name:'เปิดกรณีข้าวนครปฐม',exact:true}).click();await device.locator('.pilot-rain-summary').waitFor();
    await capture(device,name+'.png');await device.screenshot({path:resolve(folder,name+'-top.png')});report.screenshots.push(name+'-top.png');
    const region=device.getByRole('region',{name:'แถวผลิตข้าวนครปฐม เลื่อนดูทุกคอลัมน์',exact:true});
    await region.focus();await region.press('ArrowRight');await device.waitForFunction(()=>document.querySelector('.pilot-production-table').scrollLeft>0);
    await device.locator('#pilot-rain-heading').scrollIntoViewIfNeeded();
    await device.screenshot({path:resolve(folder,name+'-rain.png')});report.screenshots.push(name+'-rain.png');
    for(const selector of ['#pilot-price .pilot-chart-scroll','#pilot-rain .pilot-chart-scroll']) {
      const chart=device.locator(selector);
      assert.ok((await chart.locator('svg').boundingBox()).width>=760);
      await chart.focus();await chart.press('ArrowRight');
      assert.ok(await chart.evaluate(element=>element.scrollWidth>element.clientWidth));
    }
    assert.ok(await device.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await device.locator('#pilot-price').getByRole('link',{name:'ดูการเปลี่ยนแปลงและเดือนฐานของราคานี้',exact:true}).click();
    await device.waitForURL('**/explore?dataset=all-farmgate-prices&view=price_trend**');
    assert.ok(device.url().includes('from=2023-01')&&device.url().includes('series='+choice.id));
    await screen.close();
  }
  assert.equal((await context.request.get(base+'/areas/73')).status(),200);
  assert.deepEqual(report.errors,[]);
  report.checks.push('desktop/mobile/user widths have no page overflow; table keyboard scrolling, explicit price identity/year navigation and existing province route work; no console errors');
  report.verified={production_rows:raw.rows.length,price_months:12,rainfall_months:12,rainfall_days:365,year2024_production_rows:raw.next_year_rows};
  report.status='passed';
}catch(error){report.status='failed';report.failure=error.message.split('\n')[0];process.exitCode=1;}
finally{await writeFile(resolve(folder,'browser-check.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));}
