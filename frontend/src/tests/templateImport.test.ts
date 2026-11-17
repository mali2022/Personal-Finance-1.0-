import { describe, expect, it } from 'vitest';
import {
  parseTemplate,
  resolveTemplateReferences,
  templateDefinition,
  type TemplateKind,
} from '../utils/templateImport';
import type { Account } from '../types';
const csv = (kind: TemplateKind, values?: string[]) => {
  const d = templateDefinition(kind);
  return (
    '\uFEFF' +
    d.headers.join(',') +
    '\r\n' +
    (values || d.example).join(',') +
    '\r\n'
  );
};
describe('template import validation', () => {
  it.each<TemplateKind>(['merchants', 'projects', 'assets', 'prices', 'loans'])(
    'accepts the %s template',
    (kind) => {
      expect(parseTemplate(kind, csv(kind))).toHaveLength(1);
    },
  );
  it('handles quoted commas and multiline cells', () => {
    const r = parseTemplate(
      'merchants',
      csv('merchants', ['"商户,名称\n第二行"', 'CNY', 'Active', '']),
    );
    expect(r[0].name).toBe('商户,名称\n第二行');
  });
  it('rejects wrong headers, empty files and unclosed quotes', () => {
    for (const text of [
      'name\na',
      'name,currency,status,categoryId\n',
      'name,currency,status,categoryId\n"bad,CNY,Active,',
    ])
      expect(() => parseTemplate('merchants', text)).toThrow();
  });
  it('rejects invalid dates, negative budgets and duplicate rows', () => {
    const d = templateDefinition('projects');
    expect(() =>
      parseTemplate(
        'projects',
        csv(
          'projects',
          d.example.map((v, i) => (i === 3 ? '2026-02-30' : v)),
        ),
      ),
    ).toThrow('日期');
    expect(() =>
      parseTemplate(
        'projects',
        csv(
          'projects',
          d.example.map((v, i) => (i === 2 ? '-1' : v)),
        ),
      ),
    ).toThrow('budget');
    expect(() =>
      parseTemplate('projects', csv('projects') + d.example.join(',')),
    ).toThrow('重复');
  });
  it('limits files to 200 rows', () => {
    const d = templateDefinition('merchants');
    expect(() =>
      parseTemplate(
        'merchants',
        d.headers.join(',') +
          '\n' +
          Array.from({ length: 201 }, (_, i) => `${i},CNY,Active,`).join('\n'),
      ),
    ).toThrow('200');
  });
  it('validates borrowing direction and timestamp', () => {
    const d = templateDefinition('loans');
    for (const [i, value] of [
      [0, 'Reimbursement'],
      [4, '2026-10-18'],
      [4, '2026-02-30T12:00:00+08:00'],
    ] as const)
      expect(() =>
        parseTemplate(
          'loans',
          csv(
            'loans',
            d.example.map((v, j) => (j === i ? value : v)),
          ),
        ),
      ).toThrow();
  });
  it('resolves account names and rejects ambiguity, inactive accounts and currency mismatch', () => {
    const accounts = [
      {
        id: 'a1',
        name: '投资账户',
        accountCode: '001',
        currency: 'CNY',
        type: 'Investment',
        status: 'Active',
        balance: '0',
      },
    ] as Account[];
    const rows = [{ accountId: '投资账户', currency: 'CNY' }];
    expect(
      resolveTemplateReferences('assets', rows, accounts, [])[0].accountId,
    ).toBe('a1');
    expect(() =>
      resolveTemplateReferences(
        'assets',
        rows,
        [...accounts, { ...accounts[0], id: 'a2' }],
        [],
      ),
    ).toThrow('唯一');
    expect(() =>
      resolveTemplateReferences(
        'assets',
        rows,
        [{ ...accounts[0], status: 'Disabled' }],
        [],
      ),
    ).toThrow('状态');
    expect(() =>
      resolveTemplateReferences(
        'assets',
        [{ ...rows[0], currency: 'USD' }],
        accounts,
        [],
      ),
    ).toThrow('币种');
    expect(rows[0].accountId).toBe('投资账户');
  });
});
