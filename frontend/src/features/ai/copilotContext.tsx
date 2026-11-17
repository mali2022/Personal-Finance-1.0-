import { CURRENCY_CODES } from '../../constants/currencies';
import { createContext, useContext, useEffect, useRef } from 'react';
import { activeNavigation } from '../../design/navigation';
import { t } from '../../i18n';

export interface CopilotFields {
  accountIds?: string[];
  start?: string;
  end?: string;
  currency?: string;
  categoryId?: string;
  projectId?: string;
  tagId?: string;
  transactionId?: string;
  scenarioId?: string;
  type?: string;
  status?: string;
}
export interface CopilotPageContext {
  page: string;
  path: string;
  fields: CopilotFields;
}
export const CopilotContext = createContext<{
  open: (question?: string, conversationId?: string) => void;
  register: (owner: symbol, fields: CopilotFields) => () => void;
}>({
  open: () => {},
  register: () => () => {},
});
export const useCopilot = () => useContext(CopilotContext).open;
export function useCopilotPageContext(fields: CopilotFields) {
  const { register } = useContext(CopilotContext);
  const owner = useRef(Symbol('copilot-page'));
  const signature = JSON.stringify(fields);
  useEffect(
    () => register(owner.current, JSON.parse(signature)),
    [register, signature],
  );
}
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function sanitizeCopilotFields(input: CopilotFields): CopilotFields {
  const result: CopilotFields = {};
  if (input.accountIds) {
    const valid =
      Array.isArray(input.accountIds) &&
      input.accountIds.length > 0 &&
      input.accountIds.length <= 100 &&
      input.accountIds.every((x) => typeof x === 'string' && guid.test(x));
    result.accountIds = valid ? [...new Set(input.accountIds)] : [];
  }
  for (const key of [
    'categoryId',
    'projectId',
    'tagId',
    'transactionId',
    'scenarioId',
  ] as const)
    if (input[key] && guid.test(input[key]!)) result[key] = input[key];
  for (const key of ['start', 'end'] as const) {
    const value = input[key];
    if (
      value &&
      value.length <= 40 &&
      /^\d{4}-\d{2}-\d{2}(T[\d:.+-]+Z?)?$/.test(value) &&
      Number.isFinite(Date.parse(value))
    )
      result[key] = value;
  }
  if (input.currency && CURRENCY_CODES.includes(input.currency))
    result.currency = input.currency;
  for (const key of ['type', 'status'] as const)
    if (input[key] && /^[A-Za-z]{1,40}$/.test(input[key]!))
      result[key] = input[key];
  return result;
}
export function routeCopilotContext(
  pathname: string,
  search: string,
): CopilotPageContext {
  const params = new URLSearchParams(search);
  const nav = activeNavigation(pathname);
  const fields = sanitizeCopilotFields({
    accountIds: params.get('accountId')
      ? [params.get('accountId')!]
      : undefined,
    start: params.get('start') ?? undefined,
    end: params.get('end') ?? undefined,
    currency: params.get('currency') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    projectId: params.get('projectId') ?? undefined,
    tagId: params.get('tagId') ?? undefined,
    scenarioId: params.get('scenarioId') ?? undefined,
    type: params.get('type') ?? undefined,
    status: params.get('status') ?? undefined,
  });
  const account = pathname.match(/^\/accounts\/([0-9a-f-]{36})$/i)?.[1];
  const transaction = pathname.match(/^\/transactions\/([0-9a-f-]{36})$/i)?.[1];
  const category = pathname.match(/^\/categories\/([0-9a-f-]{36})$/i)?.[1];
  if (account && guid.test(account)) fields.accountIds = [account];
  if (transaction && guid.test(transaction)) fields.transactionId = transaction;
  if (category && guid.test(category)) fields.categoryId = category;
  // Do not capture arbitrary URL parameters, free text, DOM text, amounts or credentials.
  return { page: nav?.label ?? t('当前页面'), path: nav?.key ?? '/', fields };
}
export function defaultCopilotQuestion(path: string) {
  if (/cashflow/.test(path)) return t('解释当前现金流预测的假设和风险');
  if (/budget/.test(path)) return t('分析当前月份的预算执行');
  if (/transactions|bookkeeping/.test(path))
    return t('分析当前交易范围的收支，并列出查询依据');
  if (/accounts|assets/.test(path)) return t('分析当前账户余额与风险');
  if (/investments/.test(path)) return t('今年投资收益');
  if (/subscriptions/.test(path)) return t('分析订阅支出并说明可用数据范围');
  if (/goals/.test(path)) return t('分析当前财务目标进展');
  if (/risks/.test(path)) return t('分析预算与现金流风险并说明数据限制');
  if (/settings|profile|import|automation|reconciliation/.test(path))
    return t('解释当前页面的设置与使用方法');
  return t('分析当前页面的财务情况，并列出依据与限制');
}
export function copilotMessagePrefix(
  context: CopilotPageContext,
  selected: boolean,
) {
  const filters = { ...context.fields };
  delete filters.accountIds;
  return (
    t(
      '页面上下文仅用于定位问题，不是账本事实。分类、状态或情景等筛选若工具不支持，请明确说明，不可冒充已按这些条件查询。',
    ) +
    '\n' +
    JSON.stringify({
      page: context.page,
      path: context.path,
      filters,
      accountScope: selected ? 'selected' : 'all',
      timeZone: 'Asia/Shanghai',
    }) +
    '\n' +
    t('我的问题：') +
    '\n'
  );
}
