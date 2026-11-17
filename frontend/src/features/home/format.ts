import dayjs from 'dayjs';

/**
 * The Home control centre is pinned to Asia/Shanghai for its greeting and date
 * regardless of the machine time zone, matching the ledger's reporting day.
 */
const SHANGHAI = 'Asia/Shanghai';

export type GreetingKey = '早上好' | '下午好' | '晚上好';

export function shanghaiHour(now = new Date()): number {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHANGHAI,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const hour = Number(text);
  return Number.isFinite(hour) ? hour % 24 : now.getHours();
}

export function greetingFor(hour: number): GreetingKey {
  if (hour >= 5 && hour < 12) return '早上好';
  if (hour >= 12 && hour < 18) return '下午好';
  return '晚上好';
}

/** Full Asia/Shanghai date with weekday, e.g. `2026年10月31日 · 星期六`. */
export function shanghaiDateLabel(language: string, now = new Date()): string {
  const locale = language === 'en' ? 'en-US' : 'zh-CN';
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const weekday = new Intl.DateTimeFormat(locale, {
    timeZone: SHANGHAI,
    weekday: 'long',
  }).format(now);
  return `${date} · ${weekday}`;
}

export function isCurrentMonth(month: string): boolean {
  return month === dayjs().format('YYYY-MM');
}

/** Month heading used in cards and the greeting status line. */
export function formatMonthLabel(month: string, language = 'zh-CN'): string {
  const date = dayjs(`${month}-01`);
  if (!date.isValid()) return month;
  return language === 'en' ? date.format('MMM YYYY') : date.format('YYYY年M月');
}
