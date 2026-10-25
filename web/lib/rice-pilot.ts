export function validRicePilotQuery(year:string,series:string) {
  return /^(2023|2024)$/.test(year) && (!series || /^[a-f0-9]{64}$/.test(series));
}
