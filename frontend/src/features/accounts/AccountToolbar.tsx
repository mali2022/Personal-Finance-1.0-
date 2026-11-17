import { useState } from 'react';
import { Alert, App, Button, Input, Modal, Space, Table, Upload } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { accounts2Api, type DeletePreview } from '../../api/accounts2';
import type { Account, ApiError } from '../../types';
import { accountLabels } from '../../constants/mappings';
import { CURRENCY_CODES } from '../../constants/currencies';
import { parseCsv } from '../../utils/valuationCsv';
import { Sensitive } from '../../components/Sensitive';
import { t as tr } from '../../i18n';
export function parseAccountCsv(
  text: string,
  accounts: Account[],
): Partial<Account>[] {
  const [header, ...rows] = parseCsv(text);
  const expected = [
    '账户名称',
    '账户类型',
    '币种',
    '开户银行/机构',
    '银行卡号',
    '银行网点',
    '信用额度',
    '账单日',
    '还款日',
  ];
  if (
    !header ||
    header.length !== expected.length ||
    header.some(
      (x, i) =>
        x.trim() !== expected[i] && !(i === 4 && x.trim() === '卡号末四位'),
    )
  )
    throw new Error('CSV表头不匹配，请下载模板');
  if (!rows.length || rows.length > 500)
    throw new Error('每次导入1至500个账户');
  const names = new Set(accounts.map((a) => a.name.trim().toLowerCase()));
  return rows.map((row, index) => {
    if (row.length !== expected.length)
      throw new Error(`第${index + 2}行列数不正确`);
    const [
      name,
      typeLabel,
      currency,
      institution,
      cardNumber,
      bankBranch,
      creditLimit,
      statementDay,
      paymentDay,
    ] = row.map((x) => x.trim());
    const type = Object.keys(accountLabels).find(
      (k) =>
        k === typeLabel || accountLabels[k as Account['type']] === typeLabel,
    ) as Account['type'];
    const fail = (reason: string) => {
      throw new Error(`第${index + 2}行：${reason}`);
    };
    if (!name || name.length > 150 || names.has(name.toLowerCase()))
      fail('名称为空、过长或重复');
    names.add(name.toLowerCase());
    if (!type) fail('账户类型无效');
    if (!CURRENCY_CODES.includes(currency)) fail('币种无效');
    if (institution.length > 200 || bankBranch.length > 200)
      fail('银行资料过长');
    if (cardNumber && !/^\d{4,30}$/.test(cardNumber))
      fail('卡号须为4至30位数字');
    if (!['Bank', 'CreditCard'].includes(type) && (cardNumber || bankBranch))
      fail('该类型不支持银行资料');
    const credit = ['CreditCard', 'ConsumerCredit'].includes(type);
    if (
      credit &&
      (!/^\d+(\.\d{1,2})?$/.test(creditLimit) || Number(creditLimit) <= 0)
    )
      fail('信用额度须大于零');
    const day = (s: string) =>
      /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 31;
    if (credit && (!day(statementDay) || !day(paymentDay)))
      fail('账单日和还款日须为1至31');
    return {
      name,
      type,
      currency,
      institution,
      cardNumber: cardNumber || undefined,
      lastFourDigits: cardNumber ? cardNumber.slice(-4) : undefined,
      bankBranch,
      creditLimit: credit ? creditLimit : undefined,
      statementDay: credit ? Number(statementDay) : undefined,
      paymentDay: credit ? Number(paymentDay) : undefined,
      status: 'Active',
      billingMode: 'Monthly',
    };
  });
}
export function AccountToolbar({ accounts }: { accounts: Account[] }) {
  const { message } = App.useApp(),
    cache = useQueryClient();
  const [importRows, setImportRows] = useState<Partial<Account>[]>(),
    [key, setKey] = useState(''),
    [busy, setBusy] = useState(false),
    [previews, setPreviews] =
      useState<{ account: Account; preview: DeletePreview }[]>(),
    [confirmation, setConfirmation] = useState('');
  const refresh = () =>
    Promise.all(
      ['accounts', 'dashboard', 'account-groups'].map((k) =>
        cache.invalidateQueries({ queryKey: [k] }),
      ),
    );
  const template = () => {
    const text =
      '\uFEFF账户名称,账户类型,币种,开户银行/机构,银行卡号,银行网点,信用额度,账单日,还款日\r\n我的储蓄卡,Bank,CNY,开户银行,1234,开户网点,,,\r\n';
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = '账户导入模板.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="account-toolbar">
        <Upload
          accept=".csv,text/csv"
          showUploadList={false}
          beforeUpload={async (file) => {
            try {
              if (file.size > 2 * 1024 * 1024)
                throw new Error('CSV不能超过2MB');
              const rows = parseAccountCsv(await file.text(), accounts);
              setImportRows(rows);
              setKey(crypto.randomUUID());
            } catch (e) {
              message.error((e as Error).message);
            }
            return false;
          }}
        >
          <Button disabled={busy}>{tr('CSV 导入')}</Button>
        </Upload>
        <Button
          danger
          disabled={!accounts.length || busy}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const results = [];
              for (const account of accounts)
                results.push({
                  account,
                  preview: await accounts2Api.preview(account.id),
                });
              setPreviews(results);
              setConfirmation('');
            } catch (e) {
              message.error((e as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr('全部删除')}
        </Button>
      </div>
      <Button type="link" onClick={template}>
        {tr('下载账户 CSV 模板')}
      </Button>
      <Modal
        title={tr('预览账户导入')}
        open={!!importRows}
        width={760}
        onCancel={() => {
          if (!busy) setImportRows(undefined);
        }}
        confirmLoading={busy}
        okText={tr('确认导入')}
        onOk={async () => {
          if (!importRows || busy) return;
          setBusy(true);
          try {
            await accounts2Api.importAccounts(importRows, key);
            setImportRows(undefined);
            await refresh();
            message.success(tr('账户导入完成'));
          } catch (e) {
            message.error((e as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Table
          rowKey="name"
          scroll={{ x: 580 }}
          dataSource={importRows}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: tr('名称'),
              render: (_, a) => <Sensitive>{a.name}</Sensitive>,
            },
            { title: tr('类型'), render: (_, a) => accountLabels[a.type!] },
            { title: tr('币种'), dataIndex: 'currency' },
            {
              title: tr('开户银行'),
              render: (_, a) => <Sensitive>{a.institution || '—'}</Sensitive>,
            },
            {
              title: tr('银行卡号'),
              render: (_, a) => (
                <Sensitive>{a.cardNumber || a.lastFourDigits || '—'}</Sensitive>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        title={tr('全部删除账户')}
        open={!!previews}
        onCancel={() => {
          if (!busy) setPreviews(undefined);
        }}
        confirmLoading={busy}
        okText={tr('永久删除全部账户')}
        okButtonProps={{
          danger: true,
          disabled:
            !previews?.length ||
            previews.some((p) => !p.preview.allowed) ||
            confirmation !== '删除全部账户',
        }}
        onOk={async () => {
          if (!previews || busy) return;
          setBusy(true);
          try {
            await accounts2Api.deleteAll(
              previews.map((p) => ({
                ...p.account,
                version: p.preview.version,
              })),
            );
            setPreviews(undefined);
            await refresh();
            message.success(tr('空账户已删除，审计保留'));
          } catch (e) {
            message.error((e as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Alert
          type="warning"
          message={tr(
            '此操作针对全部账户，包含当前筛选隐藏的账户。存在历史、余额事实、默认设置或业务引用时，整批禁止删除。',
          )}
        />
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          {previews?.map(({ account, preview }) => (
            <p key={account.id}>
              <Sensitive>{account.name}</Sensitive>：
              {preview.allowed ? tr('可删除') : preview.reasons.join('；')}
            </p>
          ))}
        </div>
        <Space direction="vertical">
          <span>{tr('请输入“删除全部账户”确认')}</span>
          <Input
            aria-label={tr('删除全部账户确认')}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}
