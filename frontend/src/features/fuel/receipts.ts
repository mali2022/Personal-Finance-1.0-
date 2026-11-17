import { apiClient } from '../../api/client';
export interface FuelReceiptInput {
  fileName: string;
  contentType: string;
  base64: string;
  ocrText?: string;
  reviewedText?: string;
  ocrEngine?: string;
  fieldsConfirmed?: boolean;
}
export interface FuelReceiptRow {
  id: string;
  name: string;
  contentType: string;
  size: number;
  version: string;
}
export function parseFuelReceipt(text: string) {
  const result: Record<string, number | string> = {};
  const fields = [
    [
      'amount',
      /(?:实付(?:金额)?|支付金额|合计金额|Amount paid)\s*[:：￥¥]?\s*(\d+(?:\.\d{1,2})?)/i,
    ],
    [
      'litres',
      /(?:加油量|油量|升数|Litres)\s*(?:[（(]L[）)])?\s*[:：]?\s*(\d+(?:\.\d{1,3})?)/i,
    ],
    ['odometer', /(?:累计里程|总里程|Odometer)\s*[:：]?\s*(\d+(?:\.\d)?)/i],
    [
      'postedUnitPrice',
      /(?:挂牌单价|挂牌价|Posted price)\s*[:：￥¥]?\s*(\d+(?:\.\d{1,3})?)/i,
    ],
  ] as const;
  for (const [key, pattern] of fields) {
    const match = text.match(pattern);
    if (match) result[key] = Number(match[1]);
  }
  const discount = text.match(
    /(?:现金优惠|优惠金额|Discount)\s*[:：￥¥]?\s*(\d+(?:\.\d{1,2})?)/i,
  );
  if (discount) result.discount = Number(discount[1]);
  const grade = text.match(
    /(?:油品|油号|Fuel grade)\s*[:：]?\s*(92|95|98)(?:号|#|汽油)?/i,
  );
  if (grade) result.fuelGrade = 'Petrol' + grade[1];
  const station = text.match(
    /(?:加油站名称|站点名称|Station name)\s*[:：]\s*([^\r\n]{1,160})/i,
  );
  if (station) result.station = station[1].trim();
  const date = text.match(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/);
  if (date)
    result.date = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
  return result;
}
export async function readFuelReceipt(file: File): Promise<FuelReceiptInput> {
  if (file.size === 0 || file.size > 3 * 1024 * 1024)
    throw new Error('凭证须为1字节至3MB');
  if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type))
    throw new Error('仅支持PNG/JPG/PDF');
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('读取凭证失败'));
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.readAsDataURL(file);
  });
  return { fileName: file.name, contentType: file.type, base64 };
}
export const receiptApi = {
  list: async (id: string) =>
    (
      await apiClient.get<{ data: FuelReceiptRow[] }>(
        `/fuel/records/${id}/receipts`,
      )
    ).data.data,
  remove: async (id: string, r: FuelReceiptRow) =>
    apiClient.post(
      `/fuel/records/${id}/receipts/${r.id}/delete`,
      {},
      {
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': r.version,
        },
      },
    ),
  download: async (id: string, r: FuelReceiptRow) => {
    const response = await apiClient.get(
      `/fuel/records/${id}/receipts/${r.id}`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
