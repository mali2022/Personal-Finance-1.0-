import { expect, it } from 'vitest';
import { concertLocalTime, concertTimeZone } from '../features/concerts/time';
it('defaults legacy scenes to Shanghai without changing their instant', () => {
  expect(concertTimeZone({})).toBe('Asia/Shanghai');
  expect(concertLocalTime({ startsAt: '2025-12-31T18:00:00Z' })).toContain('2026/1/1');
});
it('shows New York local date and daylight saving for absolute instants', () => {
  expect(concertLocalTime({ startsAt: '2026-01-01T02:30:00Z', timeZone: 'America/New_York' })).toContain('2025/12/31 21:30');
  expect(concertLocalTime({ startsAt: '2026-03-08T07:30:00Z', timeZone: 'America/New_York' })).toContain('03:30');
});
it('keeps a readable absolute timestamp if the device cannot resolve a zone', () => {
  expect(concertLocalTime({ startsAt: '2026-01-01T02:30:00Z', timeZone: 'Invalid/Zone' })).toContain('2026-01-01T02:30:00Z');
});
