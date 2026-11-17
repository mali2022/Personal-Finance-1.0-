import { useEffect, useState } from 'react';
import { t, useLocale } from '../../i18n';

export function yearCountdown(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const year = part('year');
  const today = Date.UTC(year, part('month') - 1, part('day'));
  return {
    year,
    days: Math.round((Date.UTC(year + 1, 0, 1) - today) / 86400000),
  };
}

export function YearCountdown() {
  useLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const { year, days } = yearCountdown(now);
  return (
    <span className="year-countdown">
      {t('距离 {0} 年结束还有 {1} 日', year, days)}
    </span>
  );
}
