import { Select } from '../components/TouchSelect';
import { SmartWorkbench } from '../features/reconciliation/SmartWorkbench';
import { SmartOverviewPanel } from '../features/reconciliation/SmartOverviewPanel';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useRef, useState } from 'react';
import { App, Button, Card, Form, Input, Space, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { accountApi } from '../api/finance';
import { reconciliationApi } from '../api/operations';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { decimal, minor, formatDate } from '../utils/finance';
import type {
  ApiError,
  ReconciliationRecord,
  ReconciliationSnapshot,
} from '../types';
export default function ReconciliationPage() {
  useLocale();
  const [params, setParams] = useSearchParams();
  const accountId = params.get('accountId') || undefined;
  const [actual, setActual] = useState('');
  const [reason, setReason] = useState('');
  const [snapshot, setSnapshot] = useState<ReconciliationSnapshot>();
  const [page, setPage] = useState(1);
  const key = useRef({ fingerprint: '', key: crypto.randomUUID() });
  const cache = useQueryClient();
  const { message, modal } = App.useApp();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const account = accounts.data?.find((a) => a.id === accountId);
  const history = useQuery({
    queryKey: ['reconciliations', 'smart-reconciliation', accountId, page],
    queryFn: () => reconciliationApi.list(accountId!, page),
    enabled: !!accountId,
  });
  const preview = useMutation({
    mutationFn: () =>
      reconciliationApi.preview(
        accountId!,
        account?.type === 'CreditCard'
          ? decimal(-minor(actual))
          : decimal(minor(actual)),
      ),
    onSuccess: setSnapshot,
    onError: (e: ApiError) => message.error(e.message),
  });
  const save = useMutation({
    mutationFn: (body: ReconciliationSnapshot & { reason: string }) => {
      const fingerprint = JSON.stringify(body);
      if (key.current.fingerprint !== fingerprint)
        key.current = { fingerprint, key: crypto.randomUUID() };
      return reconciliationApi.commit(body, key.current.key);
    },
    onSuccess: async () => {
      await Promise.all(
        [
          'accounts',
          'transactions',
          'dashboard',
          'reports',
          'budgets',
          'reconciliations',
          'smart-reconciliation',
        ].map((k) => cache.invalidateQueries({ queryKey: [k] })),
      );
      setSnapshot(undefined);
      setReason('');
      message.success(tr('对账已完成'));
    },
    onError: (e: ApiError) => {
      message.error(e.message);
      setSnapshot(undefined);
      void accounts.refetch();
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('智能对账中心')}</PageTitle>
        </div>
      </div>
      <SmartOverviewPanel />
      <Card title={tr('核对账户')} className="mb16">
        {accounts.isError ? (
          <ErrorState error={accounts.error} retry={() => accounts.refetch()} />
        ) : (
          <Form layout="vertical">
            {' '}
            <Form.Item label={tr('对账账户')}>
              <Select
                aria-label={tr('对账账户')}
                value={accountId}
                showSearch
                optionFilterProp="label"
                loading={accounts.isPending}
                options={accounts.data
                  ?.filter(
                    (a) =>
                      a.status === 'Active' &&
                      ![
                        'Receivable',
                        'Payable',
                        'ConsumerLoan',
                        'SecuredLoan',
                      ].includes(a.type),
                  )
                  .map((a) => ({
                    value: a.id,
                    label: `${a.name} · ${a.currency}`,
                  }))}
                onChange={(id) => {
                  setParams({ accountId: id });
                  setPage(1);
                  setSnapshot(undefined);
                  setActual('');
                }}
              />
            </Form.Item>
          </Form>
        )}
      </Card>

      {accountId && account && (
        <SmartWorkbench
          key={accountId}
          accountId={accountId}
          currency={account.currency}
        />
      )}
      {!accounts.isError && (
        <Card title={tr('独立余额调整')}>
          <Form layout="vertical">
            <Form.Item
              label={
                account?.type === 'CreditCard'
                  ? tr('系统当前欠款')
                  : tr('系统余额')
              }
            >
              <Money
                value={
                  account?.type === 'CreditCard'
                    ? decimal(-minor(account.balance))
                    : account?.balance || '0'
                }
                currency={account?.currency}
              />
            </Form.Item>
            <Form.Item
              label={
                account?.type === 'CreditCard'
                  ? tr('实际欠款')
                  : tr('银行/平台实际余额')
              }
            >
              <Input
                aria-label={
                  account?.type === 'CreditCard'
                    ? tr('实际欠款')
                    : tr('实际余额')
                }
                inputMode="decimal"
                value={actual}
                placeholder={
                  account?.type === 'CreditCard'
                    ? tr('欠款填正数；溢缴款填负数，例如 -100')
                    : tr('请输入查询到的实际金额')
                }
                onChange={(e) => {
                  setActual(e.target.value);
                  setSnapshot(undefined);
                }}
              />
            </Form.Item>
            <Button
              disabled={!accountId || !actual || save.isPending}
              loading={preview.isPending}
              onClick={() => {
                try {
                  minor(actual);
                  preview.mutate();
                } catch {
                  message.error(tr('请输入有效金额，最多两位小数'));
                }
              }}
            >
              {tr('计算差额')}
            </Button>
          </Form>
          {snapshot && (
            <>
              <div className="mt20">
                <Space wrap>
                  <span>
                    {tr('实际余额')}{' '}
                    <Money
                      value={snapshot.actualBalance}
                      currency={snapshot.currency}
                    />
                  </span>
                  <span>
                    {tr('系统余额')}{' '}
                    <Money
                      value={snapshot.systemBalance}
                      currency={snapshot.currency}
                    />
                  </span>
                  <strong>
                    {tr('资产调整差额')}{' '}
                    <Money
                      value={snapshot.difference}
                      currency={snapshot.currency}
                    />
                  </strong>
                </Space>
              </div>
              <Form layout="vertical" className="mt20">
                <Form.Item label={tr('对账说明')}>
                  <Input.TextArea
                    aria-label={tr('对账说明')}
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={tr('例如：补记期初余额、现金盘点差额')}
                  />
                </Form.Item>
                <Button
                  type="primary"
                  disabled={!reason.trim()}
                  loading={save.isPending}
                  onClick={() =>
                    modal.confirm({
                      title:
                        minor(snapshot.difference) === 0n
                          ? tr('确认记录对账结果？')
                          : tr('确认创建余额调整交易？'),
                      content:
                        minor(snapshot.difference) === 0n
                          ? tr(
                              '实际余额与系统一致，将保存对账记录，不创建交易。',
                            )
                          : tr(
                              '该操作将按所示差额修改账户余额与净资产。系统会再次校验账户快照，余额变化时需要重新核对。',
                            ),
                      okText: tr('确认对账'),
                      onOk: () => save.mutateAsync({ ...snapshot, reason }),
                    })
                  }
                >
                  {tr('确认对账')}
                </Button>
              </Form>
            </>
          )}
        </Card>
      )}
      {accountId && (
        <Card title={tr('对账历史')} className="mt20">
          {history.isError ? (
            <ErrorState error={history.error} retry={() => history.refetch()} />
          ) : (
            <Table<ReconciliationRecord>
              rowKey="id"
              loading={history.isPending}
              dataSource={history.data?.items}
              scroll={{ x: 700 }}
              pagination={{
                current: page,
                pageSize: 20,
                total: history.data?.total,
                onChange: setPage,
                showSizeChanger: false,
              }}
              columns={[
                {
                  title: tr('时间'),
                  render: (_, r) => formatDate(r.createdAt, true),
                },
                {
                  title: tr('对账前余额'),
                  render: (_, r) => (
                    <Money value={r.systemBalance} currency={r.currency} />
                  ),
                },
                {
                  title: tr('实际余额'),
                  render: (_, r) => (
                    <Money value={r.actualBalance} currency={r.currency} />
                  ),
                },
                {
                  title: tr('调整差额'),
                  render: (_, r) => (
                    <Money value={r.difference} currency={r.currency} />
                  ),
                },
                {
                  title: tr('说明'),
                  dataIndex: 'reason',
                  render: (value: unknown) => (
                    <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}
    </>
  );
}
