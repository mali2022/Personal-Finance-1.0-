import { localizedPair } from '../../i18n';
import { readTransactionFilters } from '../../utils/finance';
export const transactionColumns = [
  localizedPair('date', '日期'),
  localizedPair('type', '类型'),
  localizedPair('account', '账户'),
  localizedPair('parentCategory', '一级分类'),
  localizedPair('category', '分类路径'),
  localizedPair('merchant', '商户 / 对象'),
  localizedPair('amount', '金额'),
  localizedPair('balance', '交易后余额'),
  localizedPair('project', '项目'),
  localizedPair('tags', '标签'),
  localizedPair('note', '备注'),
  localizedPair('status', '状态'),
  localizedPair('actions', '操作'),
] as const;
export type TransactionColumn = (typeof transactionColumns)[number][0];
const required: TransactionColumn[] = ['date', 'type', 'amount', 'actions'];
export function visibleColumns(raw?: string | null): TransactionColumn[] {
  return transactionColumns
    .map(([key]) => key)
    .filter(
      (key) => !raw || required.includes(key) || raw.split(',').includes(key),
    );
}
export interface SavedTransactionView {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  updatedAt: string;
}
const storageKey = (user: string) =>
  `finance-transaction-views:v1:${encodeURIComponent(user)}`;
export function normalizeViewQuery(params: URLSearchParams): string {
  const { filters, issues } = readTransactionFilters(params);
  if (issues.length) throw new Error('请先修正无效筛选条件，再保存视图。');
  const result = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (key !== 'page' && value !== undefined) result.set(key, String(value));
  });
  if (params.has('columns'))
    result.set('columns', visibleColumns(params.get('columns')).join(','));
  result.sort();
  return result.toString();
}
export function readViews(user: string): SavedTransactionView[] {
  const raw = localStorage.getItem(storageKey(user));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (
    !Array.isArray(data) ||
    data.length > 30 ||
    data.some((v: unknown) => {
      if (!v || typeof v !== 'object') return true;
      const value = v as Record<string, unknown>;
      return ['id', 'name', 'query', 'createdAt', 'updatedAt'].some(
        (key) => typeof value[key] !== 'string',
      );
    })
  )
    throw new Error('本地筛选视图格式异常，原数据已保留，请检查浏览器存储。');
  return data as SavedTransactionView[];
}
export function saveView(
  user: string,
  name: string,
  params: URLSearchParams,
): SavedTransactionView[] {
  const title = name.trim();
  if (!title || title.length > 60) throw new Error('视图名称必填，最多60字。');
  const views = readViews(user);
  if (views.length >= 30)
    throw new Error('最多保存30个视图，请先删除不再使用的视图。');
  if (
    views.some((v) => v.name.toLocaleLowerCase() === title.toLocaleLowerCase())
  )
    throw new Error('已存在同名视图，请使用其他名称。');
  const at = new Date().toISOString();
  const result = [
    ...views,
    {
      id: crypto.randomUUID(),
      name: title,
      query: normalizeViewQuery(params),
      createdAt: at,
      updatedAt: at,
    },
  ];
  localStorage.setItem(storageKey(user), JSON.stringify(result));
  return result;
}
export function deleteView(user: string, id: string): SavedTransactionView[] {
  const result = readViews(user).filter((v) => v.id !== id);
  localStorage.setItem(storageKey(user), JSON.stringify(result));
  return result;
}

export function readDefaultView(user: string): string | null {
  return localStorage.getItem(storageKey(user) + ':default');
}
export function setDefaultView(user: string, id?: string) {
  if (id && !readViews(user).some((v) => v.id === id))
    throw new Error('视图不存在');
  if (id) localStorage.setItem(storageKey(user) + ':default', id);
  else localStorage.removeItem(storageKey(user) + ':default');
}
