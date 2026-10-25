export function validPriceView(dataset:string,view:string,filters:readonly string[]) {
  return !view || (view==='price_trend' && dataset==='all-farmgate-prices' && filters.every(value=>!value));
}

export function validPriceQuery(series:string,from:string,to:string) {
  if (series && !/^[a-f0-9]{64}$/.test(series)) return false;
  const valid=(value:string)=>!value || /^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(value);
  if (!valid(from) || !valid(to)) return false;
  const index=(value:string)=>Number(value.slice(0,4))*12+Number(value.slice(5))-1;
  return !from || !to || (index(from)<=index(to) && index(to)-index(from)<240);
}
