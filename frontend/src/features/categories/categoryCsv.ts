import type { Category } from '../../types';
import { parseCsv } from '../../utils/valuationCsv';

export type CategoryKind = Category['kind'];

export const CATEGORY_CSV_HEADER = ['分类名称', '父级分类', '状态'] as const;
export const CATEGORY_CSV_MAX_ROWS = 1000;
export const CATEGORY_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CATEGORY_CSV_STATUSES = ['启用', '停用'] as const;

export interface CategoryCsvRow {
  row: number;
  name: string;
  parentPath: string;
  status: string;
}

export interface CategoryExportRow {
  name: string;
  parentPath: string;
  status: (typeof CATEGORY_CSV_STATUSES)[number];
}

export const categoryKindLabel = (kind: CategoryKind) =>
  kind === 'Income' ? '收入分类' : '支出分类';

export const categoryCsvFileName = (kind: CategoryKind) =>
  `${categoryKindLabel(kind)}.csv`;

export const categoryTemplateFileName = (kind: CategoryKind) =>
  `${categoryKindLabel(kind)}导入模板.csv`;

export function parseCategoryCsv(text: string): CategoryCsvRow[] {
  const [header, ...data] = parseCsv(text);
  if (
    !header ||
    header.length !== CATEGORY_CSV_HEADER.length ||
    header.some((cell, index) => cell.trim() !== CATEGORY_CSV_HEADER[index])
  )
    throw new Error('CSV表头不匹配，请下载导入模板');
  if (!data.length || data.length > CATEGORY_CSV_MAX_ROWS)
    throw new Error(`每次导入1至${CATEGORY_CSV_MAX_ROWS}条分类`);
  const paths = new Set<string>();
  return data.map((cells, index) => {
    const row = index + 2;
    if (cells.length !== CATEGORY_CSV_HEADER.length)
      throw new Error(`第${row}行：列数不正确`);
    const [name, rawParentPath, status] = cells.map((cell) => cell.trim());
    if (!name) throw new Error(`第${row}行：分类名称不能为空`);
    if (name.length > 100) throw new Error(`第${row}行：分类名称不能超过100字`);
    if (
      status &&
      !(CATEGORY_CSV_STATUSES as readonly string[]).includes(status)
    )
      throw new Error(`第${row}行：状态只能是“启用”或“停用”`);
    let parentPath = '';
    if (rawParentPath) {
      const levels = rawParentPath.split('/').map((part) => part.trim());
      if (levels.some((part) => !part))
        throw new Error(`第${row}行：父级分类路径无效`);
      if (levels.length > 2) throw new Error(`第${row}行：最多三级分类`);
      parentPath = levels.join('/');
      if (!paths.has(parentPath))
        throw new Error(`第${row}行：父级分类不存在或未先导入`);
    }
    paths.add(parentPath ? `${parentPath}/${name}` : name);
    return { row, name, parentPath, status: status || '启用' };
  });
}

const siblingOrder = (a: Category, b: Category) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function categoryExportRows(
  categories: Category[],
  kind: CategoryKind,
): CategoryExportRow[] {
  const scoped = categories.filter((category) => category.kind === kind);
  const byId = new Map(scoped.map((category) => [category.id, category]));
  const children = new Map<string, Category[]>();
  const roots: Category[] = [];
  for (const category of scoped) {
    if (category.parentId && byId.has(category.parentId)) {
      const siblings = children.get(category.parentId) ?? [];
      siblings.push(category);
      children.set(category.parentId, siblings);
    } else roots.push(category);
  }
  const result: CategoryExportRow[] = [];
  const visited = new Set<string>();
  const walk = (category: Category, parentPath: string) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    result.push({
      name: category.name,
      parentPath,
      status: category.status === 'Active' ? '启用' : '停用',
    });
    const path = parentPath ? `${parentPath}/${category.name}` : category.name;
    (children.get(category.id) ?? [])
      .slice()
      .sort(siblingOrder)
      .forEach((child) => walk(child, path));
  };
  roots.sort(siblingOrder).forEach((root) => walk(root, ''));
  scoped
    .filter((category) => !visited.has(category.id))
    .sort(siblingOrder)
    .forEach((category) => walk(category, ''));
  return result;
}

const csvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function categoryCsvText(rows: CategoryExportRow[]) {
  return `\uFEFF${[
    CATEGORY_CSV_HEADER.join(','),
    ...rows.map((row) =>
      [row.name, row.parentPath, row.status].map(csvCell).join(','),
    ),
  ].join('\r\n')}\r\n`;
}

export function exportCategoryCsv(categories: Category[], kind: CategoryKind) {
  return categoryCsvText(categoryExportRows(categories, kind));
}

const templateRows: Record<CategoryKind, CategoryExportRow[]> = {
  Income: [
    { name: '工资收入', parentPath: '', status: '启用' },
    { name: '奖金', parentPath: '工资收入', status: '启用' },
  ],
  Expense: [
    { name: '餐饮', parentPath: '', status: '启用' },
    { name: '早餐', parentPath: '餐饮', status: '停用' },
  ],
};

export const categoryCsvTemplate = (kind: CategoryKind) =>
  categoryCsvText(templateRows[kind]);
