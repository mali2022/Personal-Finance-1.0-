import type { Concert } from './api';
export const concertTimeZone = (scene: Pick<Concert, 'timeZone'>) => scene.timeZone ?? 'Asia/Shanghai';
export function concertLocalTime(scene: Pick<Concert, 'startsAt' | 'timeZone'>) {
  const zone = concertTimeZone(scene);
  try { return `${new Date(scene.startsAt).toLocaleString('zh-CN', { timeZone: zone, hour12: false })} (${zone})`; }
  catch { return `${scene.startsAt} (${zone}，设备不支持此时区)`; }
}
