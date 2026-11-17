import { describe, expect, it } from 'vitest';
import type { Category } from '../types';
import { parseCsv } from '../utils/valuationCsv';
import {
  categoryCsvTemplate,
  exportCategoryCsv,
  parseCategoryCsv,
} from '../features/categories/categoryCsv';

const category = (patch: Partial<Category>): Category => ({
  id: 'category',
  name: '分类',
  kind: 'Expense',
  status: 'Active',
  sortOrder: 0,
  version: '1',
  ...patch,
});

const dataRows = (text: string) => parseCsv(text).slice(1);

describe('分类CSV导入解析', () => {
  it('兼容BOM与CRLF并保留行号', () => {
    expect(
      parseCategoryCsv(
        '\uFEFF分类名称,父级分类,状态\r\n工资收入,,启用\r\n奖金,工资收入,\r\n',
      ),
    ).toEqual([
      { row: 2, name: '工资收入', parentPath: '', status: '启用' },
      { row: 3, name: '奖金', parentPath: '工资收入', status: '启用' },
    ]);
  });
  it('拒绝错误表头', () => {
    for (const text of [
      '分类名称,父级分类\n工资收入,,启用',
      '父级分类,分类名称,状态\n,工资收入,启用',
      '分类名称,父级分类,状态,备注\n工资收入,,启用,无',
    ])
      expect(() => parseCategoryCsv(text)).toThrow(
        'CSV表头不匹配，请下载导入模板',
      );
  });
  it('拒绝空文件、超过1000行及列数错误', () => {
    expect(() => parseCategoryCsv('分类名称,父级分类,状态')).toThrow(
      '每次导入1至1000条分类',
    );
    const tooMany = Array.from(
      { length: 1001 },
      (_, index) => `分类${index},,启用`,
    ).join('\n');
    expect(() =>
      parseCategoryCsv(`分类名称,父级分类,状态\n${tooMany}`),
    ).toThrow('每次导入1至1000条分类');
    expect(() =>
      parseCategoryCsv('分类名称,父级分类,状态\n工资收入,,启用,多余'),
    ).toThrow('第2行：列数不正确');
  });
  it('拒绝名称超长并将首条数据定位为第2行', () => {
    expect(() =>
      parseCategoryCsv(`分类名称,父级分类,状态\n${'名'.repeat(101)},,启用`),
    ).toThrow('第2行：分类名称不能超过100字');
    expect(() => parseCategoryCsv('分类名称,父级分类,状态\n,,启用')).toThrow(
      /^第2行：分类名称不能为空/,
    );
  });
  it('拒绝状态非法', () => {
    expect(() =>
      parseCategoryCsv('分类名称,父级分类,状态\n工资收入,,停用中'),
    ).toThrow('第2行：状态只能是“启用”或“停用”');
  });
  it('要求父级行先于子行且最多三级', () => {
    expect(() =>
      parseCategoryCsv(
        '分类名称,父级分类,状态\n工资收入,,启用\n奖金,不存在,启用',
      ),
    ).toThrow('第3行：父级分类不存在或未先导入');
    expect(() =>
      parseCategoryCsv(
        '分类名称,父级分类,状态\n子分类,父分类,启用\n父分类,,启用',
      ),
    ).toThrow('第2行：父级分类不存在或未先导入');
    expect(
      parseCategoryCsv(
        '分类名称,父级分类,状态\n一级,,启用\n二级,一级,启用\n三级,一级/二级,启用',
      ).map((row) => row.parentPath),
    ).toEqual(['', '一级', '一级/二级']);
    expect(() =>
      parseCategoryCsv(
        '分类名称,父级分类,状态\n一级,,启用\n二级,一级,启用\n三级,一级/二级,启用\n四级,一级/二级/三级,启用',
      ),
    ).toThrow('第5行：最多三级分类');
  });
});

describe('分类CSV导出与模板', () => {
  const categories = [
    category({ id: 'dinner', name: '晚餐', parentId: 'food', sortOrder: 1 }),
    category({ id: 'transport', name: '交通', sortOrder: 1 }),
    category({ id: 'work', name: '工作日早餐', parentId: 'breakfast' }),
    category({ id: 'food', name: '餐饮', sortOrder: 2 }),
    category({ id: 'breakfast', name: '早餐', parentId: 'food' }),
    category({
      id: 'salary',
      name: '工资收入',
      kind: 'Income',
      sortOrder: 0,
    }),
    category({
      id: 'old',
      name: '已停用分类',
      status: 'Disabled',
      sortOrder: 3,
    }),
  ];
  it('按树前序导出并递归拼接父级路径', () => {
    expect(dataRows(exportCategoryCsv(categories, 'Expense'))).toEqual([
      ['交通', '', '启用'],
      ['餐饮', '', '启用'],
      ['早餐', '餐饮', '启用'],
      ['工作日早餐', '餐饮/早餐', '启用'],
      ['晚餐', '餐饮', '启用'],
      ['已停用分类', '', '停用'],
    ]);
    expect(dataRows(exportCategoryCsv(categories, 'Income'))).toEqual([
      ['工资收入', '', '启用'],
    ]);
    expect(exportCategoryCsv(categories, 'Expense').startsWith('\uFEFF')).toBe(
      true,
    );
  });
  it('同级按sortOrder再按名称排序并转义逗号', () => {
    const rows = dataRows(
      exportCategoryCsv(
        [
          category({ id: 'b', name: 'B分类' }),
          category({ id: 'a', name: 'A分类' }),
          category({ id: 'comma', name: '咖啡,茶', sortOrder: 1 }),
        ],
        'Expense',
      ),
    );
    expect(rows.map((row) => row[0])).toEqual(['A分类', 'B分类', '咖啡,茶']);
    expect(rows[2][0]).toBe('咖啡,茶');
  });
  it('生成表头与两条示例行', () => {
    expect(categoryCsvTemplate('Income')).toBe(
      '\uFEFF分类名称,父级分类,状态\r\n工资收入,,启用\r\n奖金,工资收入,启用\r\n',
    );
    expect(categoryCsvTemplate('Expense')).toBe(
      '\uFEFF分类名称,父级分类,状态\r\n餐饮,,启用\r\n早餐,餐饮,停用\r\n',
    );
  });
});
