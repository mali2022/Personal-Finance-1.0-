import { apiClient } from '../../api/client';
export interface Versioned {
  id: string;
  version: string | number;
}
export interface Activity extends Versioned {
  title: string;
  category: string;
  note: string;
  projectId?: string;
  state: string;
  activeSince?: string;
  seconds: number;
  referenceCost: string | null;
  segments: { start: string; end: string }[];
}
export interface Budget extends Versioned {
  period: string;
  startDate: string;
  category: string | null;
  minutes: number;
  usedMinutes: number;
  progressPercent: number;
  overMinutes: number;
}
export interface Project extends Versioned {
  name: string;
  goal: string;
  budgetMinutes: number;
  returnUnit: string;
  targetReturn: number;
  actualReturn: number;
  state: string;
  minutes?: number;
  lifetimeMinutes?: number;
  returnPerHour?: number | null;
  budgetProgressPercent?: number;
  goalProgressPercent?: number;
  referenceTimeCost?: number | null;
  linkedIncome?: number | null;
  linkedExpense?: number | null;
}
export interface Template extends Versioned {
  name: string;
  category: string;
  minutes: number;
  projectId?: string;
  repeat: string;
}
export interface Valuation extends Versioned {
  method: string;
  source: string;
  currency: string;
  effectiveFrom: string;
  hourlyRate: number;
  income: number;
  hours: number;
  revision: number;
}
export interface TimeCatalog {
  categories: string[];
  timers: Activity[];
  valuations: Valuation[];
  templates: Template[];
  projects: Project[];
}
export interface TimeReport {
  from: string;
  to: string;
  currency: string;
  isPartial: boolean;
  generatedAt: string;
  summary: {
    recordedSeconds: number;
    elapsedSeconds: number;
    unrecordedSeconds: number;
    coveragePercent: number | null;
    valuedSeconds: number;
    valuationCoveragePercent: number | null;
    referenceCost: number | null;
    observedDiscretionarySeconds: number;
    linkedIncome: number | null;
    linkedExpense: number | null;
    combinedResourceCost: number | null;
    actualWorkHourlyRate: number | null;
    workAndCommuteSeconds: number;
    commuteReferenceCost: number | null;
    missingFxTransactions: number;
  };
  categories: {
    category: string;
    seconds: number;
    percentOfRecorded: number | null;
    denominatorSeconds: number;
  }[];
  trend: { date: string; seconds: number }[];
  activities: Activity[];
  budgets: Budget[];
  projects: Project[];
  financialLinks: (Versioned & {
    transactionId: string;
    activityId?: string;
    projectId?: string;
  })[];
  financialTransactions: {
    id: string;
    type: string;
    occurredAt: string;
    sourceCurrency: string;
    sourceIncome: string;
    sourceExpense: string;
    income: number | null;
    expense: number | null;
    laborHours: number | null;
  }[];
  definitions: Record<string, string>;
}
export const timeApi = {
  catalog: async () =>
    (await apiClient.get<{ data: TimeCatalog }>('/time-assets/catalog')).data
      .data,
  report: async (params: {
    from: string;
    to: string;
    currency: string;
    projectId?: string;
  }) =>
    (
      await apiClient.get<{ data: TimeReport }>('/time-assets/report', {
        params,
      })
    ).data.data,
  write: async (
    path: string,
    data: unknown,
    version?: string | number,
    put = false,
  ) =>
    (
      await apiClient.request({
        method: put ? 'put' : 'post',
        url: '/time-assets' + path,
        data,
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
          ...(version !== undefined ? { 'If-Match': String(version) } : {}),
        },
      })
    ).data.data,
  analyze: async (data: unknown) =>
    (
      await apiClient.post<{
        data: { explanation: string; evidence: unknown };
      }>('/time-assets/analysis', data, { timeout: 120000 })
    ).data.data,
};
export const categoryLabels: Record<string, [string, string]> = {
  Work: ['工作', 'Work'],
  Commute: ['通勤', 'Commute'],
  Learning: ['学习', 'Learning'],
  Health: ['健康', 'Health'],
  Family: ['家庭', 'Family'],
  Leisure: ['休闲', 'Leisure'],
  Sleep: ['睡眠', 'Sleep'],
  Other: ['其他', 'Other'],
};
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  return (
    '"' +
    (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
}
export function parseTimePaste(input: string): Record<string, unknown>[] {
  const lines = input
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 1 || lines.length > 100)
    throw new Error('支持1至100行 / Use 1–100 rows');
  return lines.map((line, i) => {
    const [title, categoryText, startText, endText, note = ''] = line
      .split('\t')
      .map((x) => x.trim());
    const category = Object.entries(categoryLabels).find(
      ([key, names]) =>
        key.toLowerCase() === categoryText?.toLowerCase() ||
        names.some((n) => n.toLowerCase() === categoryText?.toLowerCase()),
    )?.[0];
    const stamp = (s: string) =>
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(s)
        ? s.replace(' ', 'T') + (s.length === 16 ? ':00' : '') + '+08:00'
        : s;
    const start = stamp(startText ?? ''),
      end = stamp(endText ?? '');
    if (
      !title ||
      !category ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(start) ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(end) ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start)
    )
      throw new Error(
        `第${i + 1}行：请检查名称、分类与时间 / Row ${i + 1}: check title, category and times`,
      );
    return { title, category, start, end, note };
  });
}
export function downloadTime(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
