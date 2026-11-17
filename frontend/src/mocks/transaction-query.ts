import type { Transaction } from '../types';
import { categoryPath } from '../utils/categories';
import { accounts, categories } from './seed';
import { directory } from './phase3';
import { expenseItems } from './analytics';

export function matchesCategory(t: Transaction, id: string): boolean {
  const ids = [
    ...(t.splits.length ? [] : [t.categoryId]),
    ...t.splits.map((s) => s.categoryId),
    ...expenseItems(t).map((s) => s.categoryId),
  ];
  return ids.some(
    (item) => !!item && categoryPath(categories, item).some((c) => c.id === id),
  );
}
export function searchText(t: Transaction): string {
  const ids = t.splits.length
    ? t.splits.map((s) => s.categoryId)
    : [t.categoryId];
  return [
    t.merchant,
    t.note,
    t.amount,
    directory.find((d) => d.id === t.projectId)?.name,
    ...directory.filter((d) => t.tagIds.includes(d.id)).map((d) => d.name),
    ...accounts
      .filter((a) => a.id === t.accountId || a.id === t.toAccountId)
      .map((a) => a.name),
    ...categories
      .filter(
        (c) =>
          ids.includes(c.id) ||
          ids.some(
            (id) =>
              !!id &&
              categoryPath(categories, id).some((parent) => parent.id === c.id),
          ),
      )
      .map((c) => c.name),
  ]
    .join(' ')
    .toLowerCase();
}
