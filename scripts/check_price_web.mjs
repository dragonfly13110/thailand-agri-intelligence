import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base='http://127.0.0.1:3123',publicBase='http://127.0.0.1:3124';
const path='/explore?dataset=all-farmgate-prices&view=price_trend';
const api='/api/local-data?dataset=all-farmgate-prices&view=price_trend';
const folder=resolve('data/local/probes/web-prices-v1');
await mkdir(folder,{recursive:true});
const report={checked_at:new Date().toISOString(),checks:[],errors:[]};
const browser=await chromium.launch({headless:true});
const rawCheck=`from pathlib import Path
from decimal import Decimal
import hashlib,json
from tadih.prices import load_nabc_monthly_snapshot
product='ข้าวเปลือกเจ้าหอมมะลิ ความชื้น 15'
folder=Path('data/local/raw/oae')/('monthly-product-'+hashlib.sha256(product.encode()).hexdigest()[:24])
source=load_nabc_monthly_snapshot(folder)
result={}
for row in source['payload']['data']:
 month=str(int(row['year_th'])-543)+'-'+str(int(row['month'])).zfill(2)
 if '2024-10'<=month<='2026-09':
  assert row['unit']=='บาท/ตัน' and row['province_code']=='TH00' and int(row['week'])==0
  assert month not in result
  number=Decimal(str(row['value']).replace(',',''))/1000
  revision=hashlib.sha256(json.dumps(row,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
  result[month]={'value':float(number),'revision_id':revision}
current=Decimal(str(result['2026-09']['value']))
comparisons={}
for key,month in [('month_over_month','2026-08'),('year_over_year','2025-09')]:
 baseline=Decimal(str(result[month]['value']))
 comparisons[key]={'change':float(current-baseline),'percent_change':float((current-baseline)/baseline*100)}
manifest=json.loads((folder/'manifest.json').read_text())
print(json.dumps({'months':result,'comparisons':comparisons,'raw_checksum':manifest['checksum']},ensure_ascii=False))`;
async function snapshot(page,name){
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflows');
  await page.screenshot({path:resolve(folder,name),fullPage:true});
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const listen=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(['error','warning'].includes(e.type()))report.errors.push(e.text());});};
  listen(page);
  assert.equal((await (await context.request.get(base+api)).json()).state,'locked');
  await page.goto(base+path+'&from=2024-10&to=2026-09',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'เปิดแนวโน้มราคา',exact:true}).click();
  await page.locator('.price-chart').waitFor();
  assert.ok(page.url().includes('view=price_trend')&&page.url().includes('from=2024-10'));
  const data=await (await context.request.get(base+api+'&from=2024-10&to=2026-09')).json();
  assert.equal(data.state,'ready');assert.equal(data.series_options.length,44);assert.equal(data.points.length,24);
  assert.equal(data.selected.spatial_support,'national');assert.equal(data.license_status,'pending');
  const raw=JSON.parse(execFileSync(resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-X','utf8','-c',rawCheck],{encoding:'utf8',windowsHide:true}));
  for(const point of data.points){assert.equal(point.status,'available');assert.equal(point.value,raw.months[point.month].value);assert.equal(point.observations[0].revision_id,raw.months[point.month].revision_id);}
  for(const [key,expected] of Object.entries(raw.comparisons))for(const field of ['change','percent_change'])assert.ok(Math.abs(data.comparisons[key][field]-expected[field])<1e-10);
  assert.equal(await page.locator('.price-dot').count(),24);
  assert.ok((await page.locator('.price-summary').innerText()).includes(new Intl.NumberFormat('th-TH',{maximumFractionDigits:6}).format(raw.months['2026-09'].value)));
  const expectedPercent=raw.comparisons.year_over_year.percent_change;
  assert.ok((await page.locator('.price-comparison').innerText()).includes((expectedPercent>0?'+':'')+new Intl.NumberFormat('th-TH',{maximumFractionDigits:2}).format(expectedPercent)+'%'));
  await snapshot(page,'desktop-rice.png');
  report.raw_source_comparison={raw_checksum:raw.raw_checksum,months_checked:24,current:data.points.at(-1).value,month_over_month:data.comparisons.month_over_month.percent_change,year_over_year:data.comparisons.year_over_year.percent_change};
  report.checks.push('local session preserves view/dates; 24 rice values, revision IDs and two comparisons match independent checksummed raw API capture with explicit tonne-to-kg conversion');
  await page.locator('.price-method>summary').click();
  const catalogLink=page.getByRole('link',{name:'ดูบัญชีข้อมูลราคา',exact:true});
  assert.equal(await catalogLink.getAttribute('href'),'/catalog?category=prices');
  assert.equal((await context.request.get(new URL(await catalogLink.getAttribute('href'),base).toString())).status(),200);
  report.checks.push('price source notes link resolves to the existing reviewed price catalog instead of a missing dataset detail');
  const seriesId=await page.getByLabel('สินค้า / คุณภาพ / หน่วย',{exact:true}).inputValue();
  const again=await (await context.request.get(base+api+'&series='+seriesId+'&from=2024-10&to=2026-09')).json();
  assert.equal(again.evidence_sha256,data.evidence_sha256);
  await page.getByLabel('ตั้งแต่เดือน (ค.ศ.)',{exact:true}).fill('2026-01');
  await page.getByRole('button',{name:'ดูแนวโน้ม',exact:true}).click();
  await page.waitForURL('**from=2026-01**');
  await page.locator('.price-chart').waitFor();
  assert.equal(await page.locator('.price-dot').count(),9);
  await page.reload({waitUntil:'networkidle'});await page.locator('.price-chart').waitFor();
  assert.equal(await page.getByLabel('ตั้งแต่เดือน (ค.ศ.)',{exact:true}).inputValue(),'2026-01');
  report.checks.push('shareable series/month URL and reload; identical source revisions produce stable evidence checksum');
  const conflict=data.series_options.find(option=>option.label==='ข้าวเปลือกเจ้า ความชื้น 15');assert.ok(conflict);
  await page.goto(base+path+'&series='+conflict.id+'&from=2012-08&to=2012-12',{waitUntil:'networkidle'});
  await page.locator('.price-chart').waitFor();
  const broken=await (await context.request.get(base+api+'&series='+conflict.id+'&from=2012-08&to=2012-12')).json();
  assert.equal(broken.points[2].month,'2012-10');assert.equal(broken.points[2].status,'needs_review');assert.equal(broken.points[2].value,null);
  assert.equal((await page.locator('.price-line').getAttribute('d')).match(/M/g).length,2);
  assert.equal(await page.locator('.price-dot').count(),4);
  const blocked=await (await context.request.get(base+api+'&series='+conflict.id+'&to=2012-10')).json();
  assert.equal(blocked.comparisons.month_over_month.status,'current_needs_review');assert.equal(blocked.comparisons.month_over_month.percent_change,null);
  await snapshot(page,'desktop-conflict-gap.png');
  report.checks.push('real October 2012 conflict is null and breaks SVG path; conflicted endpoint cannot yield a price-change percentage');
  const bad=await context.request.get(base+api+'&from=2000-01&to=2026-09');assert.equal(bad.status(),400);
  const forged=await context.request.get(base+api,{headers:{cookie:'tadih_local_session='+'0'.repeat(64)}});assert.equal((await forged.json()).state,'locked');
  const disabled=await context.request.get(publicBase+api);assert.equal((await disabled.json()).state,'disabled');
  const foreign=await context.request.get(base+api,{headers:{origin:'https://evil.invalid','sec-fetch-site':'cross-site'}});assert.equal((await foreign.json()).state,'disabled');
  const publicPage=await context.newPage();listen(publicPage);await publicPage.goto(publicBase+path,{waitUntil:'networkidle'});assert.equal(await publicPage.locator('.price-chart').count(),0);
  report.checks.push('date bound HTTP400; anonymous/forged/cross-origin/public mode cannot read trends or identities');
  await page.goto(base+path+'&from=2099-01&to=2099-03',{waitUntil:'networkidle'});await page.getByText('ไม่มีค่าที่นำมาวาดกราฟได้ในช่วงนี้ ดูสถานะรายเดือนในตาราง',{exact:true}).waitFor();
  assert.equal(await page.locator('.price-chart').count(),0);assert.ok((await page.locator('.price-comparison').innerText()).includes('คำนวณไม่ได้'));
  report.checks.push('no-data interval renders explicit empty chart and unavailable comparisons rather than zeros');
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const phone=await mobile.newPage();listen(phone);const eggs=data.series_options.find(option=>option.unit==='THB/100_eggs');assert.ok(eggs);
  await phone.goto(base+path+'&series='+eggs.id+'&from=2026-01&to=2026-09',{waitUntil:'networkidle'});
  await phone.getByRole('button',{name:'เปิดแนวโน้มราคา',exact:true}).click();await phone.locator('.price-chart').waitFor();
  assert.equal(await phone.getByLabel('สินค้า / คุณภาพ / หน่วย',{exact:true}).inputValue(),eggs.id);
  assert.ok((await phone.locator('.price-summary').innerText()).includes('บาท/ร้อยฟอง'));
  assert.ok((await phone.locator('.price-change-brief').innerText()).includes('เทียบเดือนเดียวกันปีก่อน'));
  await snapshot(phone,'mobile-eggs.png');
  const region=phone.getByRole('region',{name:'ตารางเปรียบเทียบราคา เลื่อนซ้ายขวาเพื่อดูร้อยละและหลักฐาน',exact:true});
  await region.focus();await region.press('ArrowRight');
  await phone.waitForFunction(()=>document.querySelector('.price-comparison').scrollLeft>0);
  assert.equal(await phone.locator('.price-comparison').getAttribute('tabindex'),'0');
  report.checks.push('mobile product/unit selection survives session; chart and tables scroll within page, native month controls accessible');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.message.split('\n')[0];process.exitCode=1;}
finally{await writeFile(resolve(folder,'browser-check.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));}
