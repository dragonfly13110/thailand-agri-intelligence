import 'server-only';
import { getProvinces } from '../provinces';

let provinceCodes: Promise<Set<string>> | undefined;

export async function isSupportedProvinceCode(code: string) {
  provinceCodes ??= getProvinces().then(provinces => new Set(provinces.map(province => province.code)));
  return (await provinceCodes).has(code);
}
