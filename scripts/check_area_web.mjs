import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base='http://127.0.0.1:3123', publicBase='http://127.0.0.1:3124';
const folder=resolve('data/local/probes/web-areas-v1');
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={checked_at:new Date().toISOString(),checks:[],errors:[]};
const sourceQuery=`import json
from pathlib import Path
p=next(Path('data/local/production/staged').glob('*/records.jsonl'))
rows=[json.loads(line) for line in p.open(encoding='utf-8')]
selected=[r for r in rows if r['province_name']=='นครปฐม' and r['crop_type']=='ข้าวนาปี' and r['year_ad']==2023]
print(json.dumps({'rows':selected[:25],'matched_rows':len(selected),'present_production':sum(r['production_kg'] is not None for r in selected)},ensure_ascii=False))`;
async function snapshot(page,name){
  await page.evaluate(()=>document.fonts.ready);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal page overflow');
  await page.screenshot({path:resolve(folder,name),fullPage:true});
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const record=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('console',e=>{if(['error','warning'].includes(e.type()))report.errors.push(e.text());});};
  record(page);
  await page.goto(base+'/areas',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.province-list a').count(),77);
  await page.getByRole('link',{name:'นครปฐม รหัส 73',exact:true}).click();
  await page.waitForURL('**/areas/73');
  await page.goto(base+'/areas/73?dataset=short-crop-production&crop='+encodeURIComponent('ข้าวนาปี')+'&year=2023',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'เปิดตารางข้อมูลจริง',exact:true}).click();
  await page.locator('.data-table tbody tr').first().waitFor();
  assert.ok(page.url().includes('/areas/73?')&&page.url().includes('year=2023'));
  assert.equal(await page.getByLabel('พืชตามต้นทาง',{exact:true}).inputValue(),'ข้าวนาปี');
  assert.equal(await page.getByLabel('ปีข้อมูล พ.ศ.',{exact:true}).inputValue(),'2023');
  assert.equal(await page.locator('.data-table tbody tr').count(),25);
  const source=JSON.parse(execFileSync(resolve('.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['-X','utf8','-c',sourceQuery],{encoding:'utf8',windowsHide:true}));
  const query=new URLSearchParams({dataset:'short-crop-production',province:'นครปฐม',crop:'ข้าวนาปี',year:'2023'});
  const actual=await (await context.request.get(base+'/api/local-data?'+query)).json();
  assert.equal(actual.matched_rows,source.matched_rows);
  for(let i=0;i<actual.rows.length;i++)for(const key of Object.keys(actual.rows[i]))assert.deepEqual(actual.rows[i][key],source.rows[i][key],key);
  const production=actual.completeness.find(metric=>metric.key==='production_kg');
  assert.equal(production.present_rows,source.present_production);
  assert.equal(production.missing_rows,source.matched_rows-source.present_production);
  report.source_comparison={matched_rows:actual.matched_rows,production_present:production.present_rows,production_missing:production.missing_rows};
  const uiProfile=page.locator('.data-profile dl>div').filter({hasText:'ผลผลิต (กก.)'});
  assert.ok((await uiProfile.innerText()).includes(String(production.present_rows)));
  await snapshot(page,'desktop-nakhon-pathom.png');
  report.checks.push('77 province references; local session keeps area/crop/year; all first-page cells and full-filter completeness match independent JSONL scan');
  await page.getByRole('link',{name:'ถัดไป',exact:true}).click();
  await page.waitForURL('**page=2');
  await page.locator('.data-table tbody tr').first().waitFor();
  assert.ok(page.url().includes('/areas/73?')&&page.url().includes('crop=')&&page.url().includes('year=2023'));
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.data-table tbody tr').first().waitFor();
  assert.ok((await page.locator('.pagination').innerText()).includes('หน้า 2'));
  await page.getByRole('link',{name:'ล้างตัวกรอง',exact:true}).click();
  await page.waitForURL(url=>url.pathname==='/areas/73'&&!url.searchParams.has('year'));
  await page.locator('.data-table tbody tr').first().waitFor();
  assert.ok(page.url().includes('/areas/73?')&&!page.url().includes('year='));
  report.checks.push('pagination and reload keep filters; clear filters stays in selected province');
  await page.goto(base+'/areas/83?crop='+encodeURIComponent('ข้าวนาปี')+'&year=2023',{waitUntil:'networkidle'});
  await page.locator('.data-empty').waitFor();
  assert.ok((await page.locator('.data-empty').innerText()).includes('ไม่พบแถว'));
  await snapshot(page,'desktop-empty.png');
  assert.equal((await context.request.get(base+'/areas/99')).status(),404);
  const bad=await context.request.get(base+'/api/local-data?dataset=short-crop-production&year=2023%20OR%201%3D1');
  assert.equal(bad.status(),400);
  report.checks.push('province with no rows shows empty rather than fabricated values; unknown code HTTP404 and invalid year HTTP400');
  const publicPage=await context.newPage();record(publicPage);
  await publicPage.goto(publicBase+'/areas/73',{waitUntil:'networkidle'});
  assert.equal(await publicPage.locator('.data-table').count(),0);
  assert.equal(await publicPage.locator('.data-profile').count(),0);
  assert.equal((await (await context.request.get(publicBase+'/api/local-data?'+query)).json()).state,'disabled');
  report.checks.push('public area page has reference metadata only; numbers/completeness remain local');
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const phone=await mobile.newPage();record(phone);
  await phone.goto(base+'/areas/73?crop='+encodeURIComponent('ข้าวนาปี')+'&year=2023',{waitUntil:'networkidle'});
  await phone.getByRole('button',{name:'เปิดตารางข้อมูลจริง',exact:true}).click();
  await phone.locator('.data-table tbody tr').first().waitFor();
  await snapshot(phone,'mobile-nakhon-pathom.png');
  assert.equal(await phone.getByLabel('พืชตามต้นทาง',{exact:true}).inputValue(),'ข้าวนาปี');
  assert.ok(await phone.locator('.data-profile').isVisible());
  report.checks.push('mobile province filters and completeness visible without page overflow');
  const traces=[];
  async function scan(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,item.name);if(item.isDirectory())await scan(path);else if(path.endsWith('.nft.json'))traces.push(path);}}
  await scan(resolve('web/.next'));
  let references=0;
  for(const path of traces)for(const item of JSON.parse(await readFile(path,'utf8')).files){
    const target=resolve(dirname(path),item).replaceAll('\\','/');
    assert.ok(!target.startsWith(resolve('data/local').replaceAll('\\','/')+'/')&&!target.startsWith(resolve('exports/private').replaceAll('\\','/')+'/')&&!target.startsWith(resolve('.venv').replaceAll('\\','/')+'/'),'private trace entry');
    if(target===resolve('web/data/provinces.csv').replaceAll('\\','/'))references++;
  }
  assert.ok(references>0);
  report.traces_checked=traces.length;
  report.checks.push('build traces include public province reference and exclude private data, exports and Python runtime');
  assert.deepEqual(report.errors,[]);
  report.status='passed';
}catch(error){report.status='failed';report.failure=error.message.split('\n')[0];process.exitCode=1;}
finally{await writeFile(resolve(folder,'browser-check.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));}
