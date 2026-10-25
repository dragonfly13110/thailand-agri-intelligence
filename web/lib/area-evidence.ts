export function validAreaEvidenceQuery(dataset: string, view: string, province: string): boolean {
  return dataset === 'short-crop-production' && view === 'area_evidence' && Boolean(province) && province.length <= 100;
}

export function validProvinceCoverageQuery(dataset: string, view: string): boolean {
  return dataset === 'short-crop-production' && view === 'province_coverage';
}
