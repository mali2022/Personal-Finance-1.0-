import { http, HttpResponse } from 'msw';
import type { PagedResult } from '../types';

const ok = (data: unknown) => HttpResponse.json({ data });

const emptyPage = <T,>(): PagedResult<T> => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
});

/** 计划类页面（周期交易 / 订阅 / 财务日历 / 自动化规则）的最小 mock：
 *  返回空列表，让页面进入"暂无数据"状态而不是 401 掉线。 */
export const planningHandlers = [
  http.get('/api/planning/capabilities', () =>
    ok({ recurring: true, subscriptions: true, calendar: true, automation: true }),
  ),
  http.get('/api/recurring-rules', () => ok(emptyPage())),
  http.get('/api/recurring-rules/:id/history', () => ok(emptyPage())),
  http.get('/api/recurring-occurrences', () => ok(emptyPage())),
  http.get('/api/subscriptions', () => ok(emptyPage())),
  http.get('/api/calendar-events', () => ok(emptyPage())),
  http.get('/api/automation-rules', () => ok(emptyPage())),
  http.get('/api/automation-executions', () => ok(emptyPage())),
];
