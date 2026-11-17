import { apiClient } from '../../api/client';
export interface Vehicle {
  id: string;
  version: string;
  name: string;
  plate: string;
  fuelType: string;
  brand?: string | null;
  model?: string | null;
  modelYear?: number | null;
  energyType?: string;
  tankCapacity?: number | null;
  engine?: string | null;
  purchaseDate?: string | null;
  purchaseAmount?: number | null;
  purchaseCurrency?: string | null;
  initialOdometer?: number | null;
  currentOdometer?: number | null;
  latestRecordedOdometer?: number | null;
  annualDistance?: number | null;
  status?: 'Active' | 'Archived';
  note?: string | null;
}
export interface FuelEvidence {
  id: string;
  date: string;
  odometer: number | null;
  litres: number;
  tankStatus: string;
}
export interface FuelAssessment {
  participatingRecordCount?: number;
  evidenceTruncated?: boolean;
  hasEstimatedQuantity?: boolean;
  recordId: string;
  status: 'VALID' | 'PENDING' | 'INVALID' | 'INSUFFICIENT_DATA';
  reason: string;
  start: FuelEvidence | null;
  end: FuelEvidence;
  participatingRecords: FuelEvidence[];
  litres: number;
  distance: number | null;
  litresPer100Km: number | null;
  ruleVersion: string;
  calculatedAt: string;
}
export interface FuelRow {
  occurredTime?: string | null;
  odometerReset?: boolean;
  postedUnitPrice?: number | null;
  originalAmount?: number | null;
  discount?: number | null;
  pointsRedemption?: number | null;
  paymentMethod?: string | null;
  drivingScene?: string | null;
  deletedAt?: string | null;
  fuelGrade?: string;
  assessment?: FuelAssessment;
  id: string;
  version: string;
  vehicleId: string;
  date: string;
  odometer: number | null;
  litres: number;
  amount: number;
  currency: string;
  fullTank: boolean;
  tankStatus?: 'Full' | 'Partial' | 'Unknown';
  missedFill: boolean;
  station: string;
  note: string;
  enteredUnitPrice?: number | null;
  quantitySource?: 'Manual' | 'Calculated' | 'ReferenceSnapshot20261016';
  unitPrice: number | null;
  interval: null | { distance: number; litres: number; litresPer100Km: number };
}
export interface FuelReport {
  comparison?: {
    currency: string;
    previousPeriod: {
      from: string | null;
      to: string | null;
      count: number;
      amount: number;
      currentAmount: number;
      changePercent: number | null;
    };
    previousYear: {
      from: string | null;
      to: string | null;
      count: number;
      amount: number;
      currentAmount: number;
      changePercent: number | null;
    };
    rule: string;
  };
  insights?: {
    windows: {
      vehicleId: string;
      requested: number;
      samples: number;
      sufficient: boolean;
      distance: number;
      litres: number;
      litresPer100Km: number | null;
      recordIds: string[];
      estimated: boolean;
    }[];
    rule: string;
  };
  quality?: {
    ruleVersion: string;
    issues: FuelQualityIssue[];
    samples: {
      vehicleId: string;
      eligibleIntervals: number;
      requiredPriorIntervals: number;
    }[];
  };
  stationPrices?: FuelStationPrices[];
  records: FuelRow[];
  summary: {
    weightedUnitPrice?: number | null;
    count: number;
    litres: number;
    amount: number;
    currency: string;
    otherCurrencyCount: number;
    completedIntervals: number;
    distance: number;
    consumedLitres: number;
    litresPer100Km: number | null;
  };
  monthly: { month: string; litres: number; amount: number }[];
}
export interface FuelQualityIssue {
  recordId: string;
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  relatedRecordIds: string[];
  observed: number | null;
  baseline: number | null;
}
export interface FuelStationPrices {
  station: string;
  vehicleId: string;
  fuelGrade: string;
  currency: string;
  count: number;
  litres: number;
  amount: number;
  weightedUnitPrice: number;
  minimumUnitPrice: number;
  maximumUnitPrice: number;
  estimatedQuantityCount: number;
  recordIds: string[];
  trend: { date: string; unitPrice: number }[];
}
export const fuelApi = {
  assessment: async (id: string) =>
    (
      await apiClient.get<{ data: FuelAssessment }>(
        `/fuel/records/${id}/assessment`,
      )
    ).data.data,
  vehicles: async () =>
    (await apiClient.get<{ data: Vehicle[] }>('/fuel/vehicles')).data.data,
  report: async (params: {
    vehicleId?: string;
    from: string;
    to: string;
    currency: string;
  }) =>
    (await apiClient.get<{ data: FuelReport }>('/fuel/report', { params })).data
      .data,
  save: async (
    kind: 'vehicles' | 'records',
    body: unknown,
    item?: { id: string; version: string },
    key?: string,
  ) =>
    apiClient.request({
      method: item ? 'put' : 'post',
      url: `/fuel/${kind === 'records' && (body as { receipt?: unknown }).receipt ? 'record-receipts' : kind}${item ? '/' + item.id : ''}`,
      data:
        kind === 'records' && (body as { receipt?: unknown }).receipt
          ? { record: body, receipt: (body as { receipt: unknown }).receipt }
          : body,
      headers: {
        'Idempotency-Key': key ?? crypto.randomUUID(),
        ...(item ? { 'If-Match': item.version } : {}),
      },
    }),
  remove: async (
    kind: 'vehicles' | 'records',
    item: { id: string; version: string },
  ) =>
    apiClient.post(
      `/fuel/${kind}/${item.id}/delete`,
      {},
      {
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': item.version,
        },
      },
    ),
};
export function fuelCsv(rows: FuelRow[], vehicles: Vehicle[], english = false) {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    return (
      '"' +
      (/^[\s]*[=+@'-]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
      '"'
    );
  };
  return (
    '\uFEFF' +
    [
      english
        ? [
            'Date',
            'Vehicle',
            'Odometer (km)',
            'Litres',
            'Amount',
            'Currency',
            'Full tank',
            'Missed fill',
            'Station',
            'Note',
            'Entered unit price',
            'Quantity source',
            'Fuel grade',
            'Vehicle ID',
            'Fuel CSV schema',
            'Posted unit price',
            'Gross amount',
            'Discount',
            'Points redemption',
            'Payment method',
            'Driving scene',
            'Fill time',
            'Odometer reset',
          ]
        : [
            '日期',
            '车辆',
            '累计里程(km)',
            '加油量(L)',
            '实付金额',
            '币种',
            '加满',
            '漏记',
            '加油站',
            '备注',
            '录入单价',
            '加油量来源',
            '油品',
            '车辆ID',
            '加油CSV格式',
            '挂牌单价',
            '优惠前金额',
            '优惠',
            '积分抵扣',
            '支付方式',
            '行驶场景',
            '加油时间',
            '里程表重置',
          ],
      ...rows.map((r) => [
        r.date,
        vehicles.find((v) => v.id === r.vehicleId)?.name ?? '',
        r.odometer,
        r.litres,
        r.amount,
        r.currency,
        r.tankStatus ?? 'Unknown',
        r.missedFill,
        r.station,
        r.note,
        r.enteredUnitPrice,
        r.quantitySource === 'ReferenceSnapshot20261016'
          ? english
            ? 'Reference price estimate (2026-10-16)'
            : '参考价估算（2026-10-16）'
          : r.quantitySource === 'Calculated'
            ? english
              ? 'Amount / price'
              : '金额÷单价'
            : english
              ? 'Manual'
              : '手动录入',
        r.fuelGrade ?? 'Unknown',
        r.vehicleId,
        'fuel-csv-2',
        r.postedUnitPrice,
        r.originalAmount,
        r.discount,
        r.pointsRedemption,
        r.paymentMethod,
        r.drivingScene,
        r.occurredTime,
        r.odometerReset ?? false,
      ]),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  );
}
