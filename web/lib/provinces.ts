import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type Province = {code:string; name:string; sourceUrl:string; sourceVersion:string};

const EMBEDDED_PROVINCES_CSV = `area_code,province_code,name_th,admin_level,geom_version,source_url,source_version,verified_at,verification_status
10,10,กรุงเทพมหานคร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
11,11,สมุทรปราการ,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
12,12,นนทบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
13,13,ปทุมธานี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
14,14,พระนครศรีอยุธยา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
15,15,อ่างทอง,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
16,16,ลพบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
17,17,สิงห์บุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
18,18,ชัยนาท,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
19,19,สระบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
20,20,ชลบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
21,21,ระยอง,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
22,22,จันทบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
23,23,ตราด,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
24,24,ฉะเชิงเทรา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
25,25,ปราจีนบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
26,26,นครนายก,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
27,27,สระแก้ว,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
30,30,นครราชสีมา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
31,31,บุรีรัมย์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
32,32,สุรินทร์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
33,33,ศรีสะเกษ,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
34,34,อุบลราชธานี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
35,35,ยโสธร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
36,36,ชัยภูมิ,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
37,37,อำนาจเจริญ,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
38,38,บึงกาฬ,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
39,39,หนองบัวลำภู,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
40,40,ขอนแก่น,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
41,41,อุดรธานี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
42,42,เลย,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
43,43,หนองคาย,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
44,44,มหาสารคาม,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
45,45,ร้อยเอ็ด,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
46,46,กาฬสินธุ์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
47,47,สกลนคร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
48,48,นครพนม,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
49,49,มุกดาหาร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
50,50,เชียงใหม่,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
51,51,ลำพูน,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
52,52,ลำปาง,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
53,53,อุตรดิตถ์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
54,54,แพร่,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
55,55,น่าน,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
56,56,พะเยา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
57,57,เชียงราย,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
58,58,แม่ฮ่องสอน,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
60,60,นครสวรรค์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
61,61,อุทัยธานี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
62,62,กำแพงเพชร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
63,63,ตาก,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
64,64,สุโขทัย,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
65,65,พิษณุโลก,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
66,66,พิจิตร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
67,67,เพชรบูรณ์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
70,70,ราชบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
71,71,กาญจนบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
72,72,สุพรรณบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
73,73,นครปฐม,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
74,74,สมุทรสาคร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
75,75,สมุทรสงคราม,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
76,76,เพชรบุรี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
77,77,ประจวบคีรีขันธ์,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
80,80,นครศรีธรรมราช,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
81,81,กระบี่,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
82,82,พังงา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
83,83,ภูเก็ต,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
84,84,สุราษฎร์ธานี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
85,85,ระนอง,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
86,86,ชุมพร,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
90,90,สงขลา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
91,91,สตูล,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
92,92,ตรัง,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
93,93,พัทลุง,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
94,94,ปัตตานี,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
95,95,ยะลา,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied
96,96,นราธิวาส,province,,https://std.moc.go.th/std/group/28,1 (2019-07-16),2026-10-22,code_name_verified_geometry_not_supplied`;

export function parseProvinces(csv:string): Province[] {
  // The versioned project CSV has no quoted cells; fail closed if its format changes.
  if (csv.includes('"')) throw new Error('Province reference format changed');
  const [header,...lines] = csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if (header !== 'area_code,province_code,name_th,admin_level,geom_version,source_url,source_version,verified_at,verification_status') throw new Error('Invalid province reference');
  const rows = lines.map(line => {
    const cells = line.split(',');
    if (cells.length !== 9 || !/^\d{2}$/.test(cells[0]) || cells[0] !== cells[1] || !cells[2] || cells[3] !== 'province' || !cells[5].startsWith('https://')) throw new Error('Invalid province row');
    return {code:cells[0],name:cells[2],sourceUrl:cells[5],sourceVersion:cells[6]};
  });
  const expected='10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 67 70 71 72 73 74 75 76 77 80 81 82 83 84 85 86 90 91 92 93 94 95 96';
  if (rows.length !== 77 || rows.map(row=>row.code).sort().join(' ') !== expected || new Set(rows.map(row=>row.name)).size !== 77) throw new Error('Expected all 77 provinces exactly once');
  return rows.sort((a,b)=>a.name.localeCompare(b.name,'th'));
}

export async function getProvinces(): Promise<Province[]> {
  try {
    const csv = await readFile(join(process.cwd(), 'data', 'provinces.csv'), 'utf8');
    return parseProvinces(csv);
  } catch {
    // Edge/serverless fallback when filesystem is not accessible
    return parseProvinces(EMBEDDED_PROVINCES_CSV);
  }
}
