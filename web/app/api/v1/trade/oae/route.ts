import { handleApi, HubRequestError, jsonData } from '../../../../../lib/hub/http';
import { loadOaeTradeEnvelope } from '../../../../../lib/hub/oae-trade-data';

export const dynamic = 'force-dynamic';

function yearLabelQuery(url: URL): string | null {
  for (const key of url.searchParams.keys()) {
    if (key !== 'yearLabel') throw new HubRequestError(400, 'INVALID_QUERY', 'ไม่รู้จักพารามิเตอร์: ' + key);
  }
  const values = url.searchParams.getAll('yearLabel');
  if (values.length > 1) throw new HubRequestError(400, 'INVALID_QUERY', 'ระบุพารามิเตอร์ yearLabel ซ้ำ');
  if (!values.length) return null;
  const value = values[0].normalize('NFC').trim();
  if (!value || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HubRequestError(400, 'INVALID_QUERY', 'ค่า yearLabel ไม่ถูกต้อง');
  }
  return value;
}

/** GET /api/v1/trade/oae?yearLabel=2568 uses the OAE year token as an opaque label. */
export async function GET(request: Request) {
  return handleApi(async () => {
    const yearLabel = yearLabelQuery(new URL(request.url));
    const envelope = await loadOaeTradeEnvelope(yearLabel);
    return jsonData(envelope.data, { meta: envelope.meta });
  });
}
