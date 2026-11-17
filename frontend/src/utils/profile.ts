export function formatProfileDate(
  value: string,
  language: 'zh-CN' | 'en',
  timeZone: string,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = language === 'en' ? 'en-US' : 'zh-CN';
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      date,
    );
  } catch {
    // Older servers can return Windows time-zone IDs unsupported by browsers.
    // Make the fallback zone explicit instead of breaking the entire profile page.
    return `${new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date)} (UTC)`;
  }
}
