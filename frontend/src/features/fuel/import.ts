import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { parseCsv } from '../../utils/valuationCsv';
import { CURRENCY_CODES } from '../../constants/currencies';
import type { Vehicle } from './api';
import { litresFromPrice } from './calculation';

export interface FuelImportRecord {
  occurredTime?: string | null;
  odometerReset?: boolean;
  postedUnitPrice?: number | null;
  originalAmount?: number | null;
  discount?: number | null;
  pointsRedemption?: number | null;
  paymentMethod?: string | null;
  drivingScene?: string | null;
  vehicleId: string;
  date: string;
  odometer: number | null;
  litres: number;
  amount: number;
  currency: string;
  tankStatus: string;
  fullTank: boolean;
  missedFill: boolean;
  station: string;
  note: string;
  fuelGrade: string;
  quantitySource: string;
  enteredUnitPrice: number | null;
  historicalBackfill: boolean;
}
export interface FuelCsvRow {
  row: number;
  input?: FuelImportRecord;
  errors: string[];
  warnings: string[];
}
export interface FuelImportPlan {
  rows: {
    row: number;
    status: 'READY' | 'DUPLICATE' | 'ERROR';
    reason: string | null;
    duplicateIds: string[];
  }[];
  ready: number;
  duplicates: number;
  errors: number;
}
const aliases: Record<string, string[]> = {
  date: ['date', '日期'],
  vehicle: ['vehicle', '车辆'],
  vehicleId: ['vehicleid', '车辆id'],
  odometer: ['odometer(km)', '累计里程(km)'],
  litres: ['litres', '加油量(l)'],
  amount: ['amount', '实付金额'],
  currency: ['currency', '币种'],
  tankStatus: ['fulltank', 'tankstatus', '加满'],
  missedFill: ['missedfill', '漏记'],
  station: ['station', '加油站'],
  note: ['note', '备注'],
  enteredUnitPrice: ['enteredunitprice', '录入单价'],
  quantitySource: ['quantitysource', '加油量来源'],
  fuelGrade: ['fuelgrade', '油品'],
  postedUnitPrice: ['postedunitprice', '挂牌单价'],
  originalAmount: ['grossamount', '优惠前金额'],
  discount: ['discount', '优惠'],
  pointsRedemption: ['pointsredemption', '积分抵扣'],
  paymentMethod: ['paymentmethod', '支付方式'],
  drivingScene: ['drivingscene', '行驶场景'],
  occurredTime: ['filltime', '加油时间'],
  odometerReset: ['odometerreset', '里程表重置'],
  schema: ['fuelcsvschema', '加油csv格式'],
};
const normalize = (value: string) =>
  value.trim().toLowerCase().replaceAll(/\s/g, '');
export function parseFuelCsv(text: string, vehicles: Vehicle[]): FuelCsvRow[] {
  if (text.length > 1024 * 1024) throw new Error('CSV最大1MB');
  const table = parseCsv(text);
  if (table.length < 2 || table.length > 201)
    throw new Error('CSV须有表头及1至200条记录');
  const columns = new Map<string, number>();
  table[0].forEach((header, index) => {
    const key = Object.keys(aliases).find((key) =>
      aliases[key].includes(normalize(header)),
    );
    if (key) {
      if (columns.has(key)) throw new Error(`重复字段：${key}`);
      columns.set(key, index);
    }
  });
  for (const required of ['date', 'litres', 'amount', 'currency'])
    if (!columns.has(required)) throw new Error(`缺少必填表头：${required}`);
  if (!columns.has('vehicle') && !columns.has('vehicleId'))
    throw new Error('须提供Vehicle ID或Vehicle/车辆表头');
  return table.slice(1).map((cells, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const get = (key: string) => {
      const value = cells[columns.get(key) ?? -1] ?? '';
      const schema = cells[columns.get('schema') ?? -1];
      return schema === 'fuel-csv-2' &&
        value.startsWith("'") &&
        /^[\s]*[=+@'-]/.test(value.slice(1))
        ? value.slice(1)
        : value;
    };
    const number = (key: string, places: number, optional = false) => {
      const text = get(key).trim();
      if (optional && !text) return null;
      if (!new RegExp(`^\\d{1,10}(\\.\\d{1,${places}})?$`).test(text)) {
        errors.push(`${key}数值或精度无效`);
        return 0;
      }
      return Number(text);
    };
    if (cells.length !== table[0].length) errors.push('列数与表头不同');
    const id = get('vehicleId').trim(),
      name = get('vehicle').trim();
    const candidates = id
      ? vehicles.filter((v) => v.id === id)
      : vehicles.filter(
          (v) =>
            v.name === name ||
            v.id === name ||
            ("'" + v.name === name && /^[\s]*[=+@-]/.test(v.name)),
        );
    const vehicle = candidates.length === 1 ? candidates[0] : undefined;
    if (!vehicle) errors.push('车辆不存在或名称不唯一，请使用车辆ID');
    else if (vehicle.status === 'Archived') errors.push('车辆已归档，请先恢复');
    const date = get('date').trim();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !dayjs(date).isValid() ||
      dayjs(date).format('YYYY-MM-DD') !== date
    )
      errors.push('日期格式须为有效YYYY-MM-DD');
    const odometer = number('odometer', 1, true),
      litres = number('litres', 3)!,
      amount = number('amount', 2)!,
      enteredUnitPrice = number('enteredUnitPrice', 3, true);
    if (litres <= 0 || litres > 10000 || amount < 0 || amount > 100000000)
      errors.push('油量或金额超出范围');
    const currency = get('currency').trim();
    if (!CURRENCY_CODES.some((code) => code === currency))
      errors.push('币种无效');
    const rawTank = get('tankStatus').trim();
    let tankStatus = 'Unknown';
    if (['Full', 'Partial', 'Unknown'].includes(rawTank)) tankStatus = rawTank;
    else if (
      rawTank &&
      !['true', 'false', 'TRUE', 'FALSE', '是', '否'].includes(rawTank)
    )
      errors.push('加满状态须为Full/Partial/Unknown');
    if (tankStatus === 'Unknown')
      warnings.push(
        rawTank
          ? '旧布尔加满标记不自动确认，按未知导入'
          : '加满状态未知，不生成可信满箱油耗',
      );
    const missed = get('missedFill').trim();
    if (
      missed &&
      !['true', 'false', 'TRUE', 'FALSE', '是', '否'].includes(missed)
    )
      errors.push('漏记字段须为true/false');
    const sources: Record<string, string> = {
      '': 'Manual',
      Manual: 'Manual',
      手动录入: 'Manual',
      'Amount / price': 'Calculated',
      Calculated: 'Calculated',
      '金额÷单价': 'Calculated',
      'Reference price estimate (2026-10-16)': 'ReferenceSnapshot20261016',
      '参考价估算（2026-10-16）': 'ReferenceSnapshot20261016',
      ReferenceSnapshot20261016: 'ReferenceSnapshot20261016',
    };
    const quantitySource = sources[get('quantitySource').trim()];
    if (!quantitySource) errors.push('加油量来源无效');
    if (quantitySource === 'Manual' && enteredUnitPrice != null)
      errors.push('手填油量须留空录入单价');
    if (
      quantitySource &&
      quantitySource !== 'Manual' &&
      (enteredUnitPrice == null ||
        litresFromPrice(amount, enteredUnitPrice) !== litres)
    )
      errors.push('推算油量须与金额/单价保留3位小数一致');
    const fuelGrade = get('fuelGrade').trim() || 'Unknown';
    if (
      ![
        'Unknown',
        'Petrol92',
        'Petrol95',
        'Petrol98',
        'Diesel0',
        'DieselMinus10',
        'Other',
      ].includes(fuelGrade)
    )
      errors.push('油品代码无效');
    const time = get('occurredTime').trim();
    if (time && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time))
      errors.push('加油时间须为HH:mm:ss');
    const input: FuelImportRecord = {
      vehicleId: vehicle?.id ?? '',
      date,
      odometer,
      litres,
      amount,
      currency,
      tankStatus,
      fullTank: tankStatus === 'Full',
      missedFill: ['true', 'TRUE', '是'].includes(missed),
      station: get('station'),
      note: get('note'),
      fuelGrade,
      quantitySource: quantitySource ?? 'Manual',
      enteredUnitPrice,
      postedUnitPrice: number('postedUnitPrice', 3, true),
      originalAmount: number('originalAmount', 2, true),
      discount: number('discount', 2, true),
      pointsRedemption: number('pointsRedemption', 2, true),
      paymentMethod: get('paymentMethod') || null,
      drivingScene: get('drivingScene') || null,
      occurredTime: time || null,
      odometerReset: ['true', 'TRUE', '是'].includes(get('odometerReset')),
      historicalBackfill: odometer == null,
    };
    return { row: index + 2, input, errors, warnings };
  });
}
export const fuelImportApi = {
  preview: async (records: FuelImportRecord[]) =>
    (
      await apiClient.post<{ data: FuelImportPlan }>(
        '/fuel/records/import/preview',
        { records },
      )
    ).data.data,
  confirm: async (records: FuelImportRecord[], key: string) =>
    (
      await apiClient.post<{
        data: {
          imported: number;
          skippedDuplicates: number;
          recordIds: string[];
        };
      }>(
        '/fuel/records/import/confirm',
        { records },
        { headers: { 'Idempotency-Key': key } },
      )
    ).data.data,
};
