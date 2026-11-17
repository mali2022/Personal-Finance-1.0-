import { anomalyLabels, anomalyExplanations } from './anomalyRules';
import { useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  Select,
  Space,
  Tag,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { workspaceApi } from './workspaceApi';
import { ReviewDrawer } from './ReviewDrawer';
import { TransactionStatementLinks } from '../reconciliation/TransactionStatementLinks';
import { t as tr, useLocale } from '../../i18n';
import { formatDate, formatMoney, minor, decimal } from '../../utils/finance';
import { useUI } from '../../stores/ui';
import type { TransactionDetailDto } from '../../types';

export function TransactionIntegrityPanel({
  transaction: t,
  onClose,
}: {
  transaction: TransactionDetailDto;
  onClose: () => void;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const { message, modal } = App.useApp();
  const [expanded, setExpanded] = useState(false);
  const issues = useQuery({
    queryKey: ['transactions', 'issues', t.id, t.version],
    queryFn: () => workspaceApi.issues(t.id),
    enabled: expanded,
    refetchInterval: false,
  });
  const matches = useQuery({
    queryKey: ['transactions', 'matches', t.id, t.version],
    queryFn: () => workspaceApi.matches(t.id),
    enabled: expanded,
    refetchInterval: false,
  });
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<{
    accountId: string;
    statementReference: string;
    amount: string;
    note: string;
  }>();
  const accountId = Form.useWatch('accountId', form);
  const amount = Form.useWatch('amount', form);
  const entries = t.entries.filter(
    (e) => e.kind === 'Account' && e.accountId === accountId,
  );
  const ledger = entries.reduce((sum, e) => sum + minor(e.amount), 0n);
  const submission = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  const keys = (signature: string) => {
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    return submission.current.key;
  };
  return (
    <>
      <Collapse
        onChange={(keys) => setExpanded(keys.includes('integrity'))}
        items={[
          {
            key: 'integrity',
            label: tr('异常复核与逐笔对账'),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                {issues.isError ? (
                  <Alert
                    type="error"
                    message={tr('异常检测加载失败')}
                    action={
                      <Button onClick={() => issues.refetch()}>
                        {tr('重试')}
                      </Button>
                    }
                  />
                ) : issues.data?.rules.length ? (
                  <>
                    {issues.data.rules.map((code) => (
                      <Alert
                        key={code}
                        type="warning"
                        message={tr(anomalyLabels[code] || code)}
                        description={tr(anomalyExplanations[code] || code)}
                      />
                    ))}
                    <Button onClick={() => setReview(true)}>
                      {tr('人工复核与处理历史')}
                    </Button>
                  </>
                ) : (
                  <span>
                    {issues.isPending
                      ? tr('检测中…')
                      : tr('未命中当前异常规则')}
                  </span>
                )}
                <p>{tr('异常记录不会自动删除或从统计中隐藏。')}</p>
                <Space wrap>
                  <Link
                    to={`/reconciliation?accountId=${t.accountId}`}
                    onClick={onClose}
                  >
                    {tr('账户余额与对账历史')}
                  </Link>
                  {t.importJobId && (
                    <Link
                      to={`/import?job=${encodeURIComponent(t.importJobId)}`}
                      onClick={onClose}
                    >
                      {tr('查看导入来源')}
                    </Link>
                  )}
                </Space>
                {t.importJobId && (
                  <span>
                    {tr('导入任务')}: {hidden ? '••••' : t.importJobId} ·{' '}
                    {tr('来源记录')}: {hidden ? '••••' : t.externalId || '—'}
                  </span>
                )}
                <p>
                  {tr(
                    '填写账单唯一标识及带方向的账户金额：支出为负、收入为正。差额只记录，不自动调整余额。',
                  )}
                </p>
                <Form
                  form={form}
                  layout="vertical"
                  disabled={busy || t.status === 'Deleted'}
                  onFinish={(values) => {
                    const body = { ...values, version: t.version };
                    let difference: string;
                    try {
                      difference = decimal(minor(values.amount) - ledger);
                    } catch {
                      message.error(tr('金额格式无效'));
                      return;
                    }
                    modal.confirm({
                      title: tr('确认账单匹配'),
                      content: (
                        <>
                          <p>
                            {tr('账本金额')}:{' '}
                            {formatMoney(
                              decimal(ledger),
                              entries[0]?.currency || t.currency,
                              hidden,
                            )}
                          </p>
                          <p>
                            {tr('差额')}:{' '}
                            {formatMoney(
                              difference,
                              entries[0]?.currency || t.currency,
                              hidden,
                            )}
                          </p>
                          <p>
                            {tr('核对只保存匹配结果及审计记录，不改写余额。')}
                          </p>
                        </>
                      ),
                      onOk: async () => {
                        setBusy(true);
                        try {
                          await workspaceApi.match(
                            t.id,
                            body,
                            keys(JSON.stringify(body)),
                          );
                          await cache.invalidateQueries();
                          form.resetFields();
                          message.success(tr('核对结果已保存'));
                        } catch (e) {
                          message.error((e as Error).message);
                          throw e;
                        } finally {
                          setBusy(false);
                        }
                      },
                    });
                  }}
                >
                  <Form.Item
                    name="accountId"
                    label={tr('核对账户')}
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        ...new Set(
                          t.entries
                            .filter((e) => e.kind === 'Account')
                            .map((e) => e.accountId!),
                        ),
                      ].map((value) => ({
                        value,
                        label:
                          t.accountBalances?.find((a) => a.accountId === value)
                            ?.name || value,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="statementReference"
                    label={tr('账单唯一标识')}
                    rules={[{ required: true, whitespace: true }, { max: 200 }]}
                  >
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item
                    name="amount"
                    label={tr('账单账户金额')}
                    rules={[
                      { required: true },
                      { pattern: /^-?\d{1,18}(\.\d{1,2})?$/ },
                    ]}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  {amount &&
                    /^-?\d{1,18}(\.\d{1,2})?$/.test(amount) &&
                    accountId && (
                      <p>
                        {tr('预览差额')}:{' '}
                        {formatMoney(
                          decimal(minor(amount) - ledger),
                          entries[0]?.currency || t.currency,
                          hidden,
                        )}
                      </p>
                    )}
                  <Form.Item
                    name="note"
                    label={tr('核对说明')}
                    rules={[
                      { required: true, whitespace: true },
                      { max: 2000 },
                    ]}
                  >
                    <Input.TextArea maxLength={2000} />
                  </Form.Item>
                  <Button htmlType="submit" loading={busy}>
                    {tr('预览并核对')}
                  </Button>
                </Form>
                {matches.isError && (
                  <Alert
                    type="error"
                    message={tr('匹配历史加载失败')}
                    action={
                      <Button onClick={() => matches.refetch()}>
                        {tr('重试')}
                      </Button>
                    }
                  />
                )}
                {matches.data?.map((m) => (
                  <div key={m.id}>
                    <Tag>
                      {tr(
                        (
                          {
                            Matched: '已匹配',
                            Difference: '存在差异',
                            Revoked: '已撤销',
                          } as Record<string, string>
                        )[m.state] || m.state,
                      )}
                    </Tag>
                    {hidden ? '••••' : m.statementReference} ·{' '}
                    {formatDate(m.createdAt, true)}
                    <p>
                      {tr('账单金额')}:{' '}
                      {formatMoney(m.amount, m.currency, hidden)} ·{' '}
                      {tr('账本金额')}:{' '}
                      {formatMoney(m.ledgerAmount, m.currency, hidden)} ·{' '}
                      {tr('差额')}:{' '}
                      {formatMoney(m.difference, m.currency, hidden)}
                    </p>
                    <p>{hidden ? '••••' : m.note}</p>
                    {m.state !== 'Revoked' && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          modal.confirm({
                            title: tr('撤销此匹配？'),
                            onOk: async () => {
                              setBusy(true);
                              try {
                                await workspaceApi.revoke(
                                  t.id,
                                  m,
                                  keys(`revoke:${m.id}:${m.version}`),
                                );
                                await cache.invalidateQueries();
                              } catch (e) {
                                message.error((e as Error).message);
                                throw e;
                              } finally {
                                setBusy(false);
                              }
                            },
                          })
                        }
                      >
                        {tr('撤销匹配')}
                      </Button>
                    )}
                  </div>
                ))}
                {expanded&&<TransactionStatementLinks transactionId={t.id} version={t.version} onNavigate={onClose}/>}
              </Space>
            ),
          },
        ]}
      />
      {review && (
        <ReviewDrawer
          id={t.id}
          onClose={() => setReview(false)}
          onEdit={() => setReview(false)}
        />
      )}
    </>
  );
}
