import { useState } from 'react';
import { Alert, App, Button, Card, Input, Select, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale } from '../../i18n';
import { smartApi } from './api';
import type { Statement } from './api';
interface Allocation {
  key: string;
  statementId: string;
  statementVersion: string;
  transactionId: string;
  transactionVersion: string;
  amount: string;
}
function AllocationRow({
  value,
  statements,
  change,
  remove,
}: {
  value: Allocation;
  statements: Statement[];
  change: (value: Allocation) => void;
  remove: () => void;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, enText: string) => (en ? enText : zh);
  const candidates = useQuery({
    queryKey: ['smart-reconciliation', 'candidates', value.statementId],
    queryFn: () => smartApi.candidates(value.statementId),
    enabled: !!value.statementId,
  });
  return (
    <Card size="small" className="mb16">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Select
          aria-label={t('分配来源流水', 'Allocation source statement')}
          style={{ width: '100%' }}
          value={value.statementId || undefined}
          placeholder={t(
            '选择本页待核对流水',
            'Select a pending statement on this page',
          )}
          options={statements
            .filter(
              (r) => r.state === 'Pending' || r.state === 'PartiallyMatched',
            )
            .map((r) => ({
              value: r.id,
              label: `${r.merchant || r.reference} · ${r.amount}`,
            }))}
          onChange={(id) => {
            const r = statements.find((r) => r.id === id)!;
            change({
              ...value,
              statementId: id,
              statementVersion: r.version,
              transactionId: '',
              transactionVersion: '',
            });
          }}
        />
        <Select
          aria-label={t('分配内部交易', 'Allocation ledger transaction')}
          style={{ width: '100%' }}
          loading={candidates.isPending && !!value.statementId}
          value={value.transactionId || undefined}
          placeholder={t('选择内部交易', 'Select a ledger transaction')}
          options={candidates.data?.candidates
            .filter((c) => c.confidence !== 'Conflict')
            .map((c) => ({
              value: c.transactionId,
              label: `${c.merchant || c.type} · ${c.amount}`,
            }))}
          onChange={(id) => {
            const c = candidates.data!.candidates.find(
              (c) => c.transactionId === id,
            )!;
            change({
              ...value,
              transactionId: id,
              transactionVersion: c.version,
            });
          }}
        />
        {candidates.isError && (
          <Alert
            type="error"
            message={candidates.error.message}
            action={
              <Button onClick={() => void candidates.refetch()}>
                {t('重试', 'Retry')}
              </Button>
            }
          />
        )}
        <Input
          aria-label={t('带符号分配金额', 'Signed allocation amount')}
          value={value.amount}
          onChange={(e) => change({ ...value, amount: e.target.value })}
          inputMode="decimal"
          placeholder={t('例如支出 -10.00', 'For an outflow: -10.00')}
        />
        <Button onClick={remove}>{t('移除此分配', 'Remove allocation')}</Button>
      </Space>
    </Card>
  );
}
export function AllocationPanel({ statements }: { statements: Statement[] }) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const { modal, message } = App.useApp();
  const cache = useQueryClient();
  const [rows, setRows] = useState<Allocation[]>([]);
  const [reason, setReason] = useState('');
  const action = useMutation({
    mutationFn: async () => {
      const body = { allocations: rows.map(({ key: _, ...r }) => r), reason };
      const key = crypto.randomUUID();
      const preview = await smartApi.allocations(body, false, key);
      modal.confirm({
        title: t('人工组合匹配影响预览', 'Manual allocation preview'),
        content: (
          <>
            {preview.items.map((r, i) => (
              <p key={i}>
                {r.amount} · {t('来源剩余', 'Statement remainder')}:{' '}
                {r.statementRemainder}
              </p>
            ))}
          </>
        ),
        onOk: async () => {
          try {
            await smartApi.allocations(body, true, key);
            setRows([]);
            setReason('');
            await cache.invalidateQueries({
              queryKey: ['smart-reconciliation'],
            });
            message.success(t('组合匹配已保存', 'Allocations saved'));
          } catch (e) {
            message.error((e as Error).message);
          }
        },
      });
    },
    onError: (e: Error) => message.error(e.message),
  });
  return (
    <>
      {rows.map((r, i) => (
        <AllocationRow
          key={r.key}
          value={r}
          statements={statements}
          change={(v) =>
            setRows((current) =>
              current.map((x, index) => (index === i ? v : x)),
            )
          }
          remove={() =>
            setRows((current) => current.filter((x) => x.key !== r.key))
          }
        />
      ))}
      <Button
        disabled={rows.length >= 40}
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: crypto.randomUUID(),
              statementId: '',
              statementVersion: '',
              transactionId: '',
              transactionVersion: '',
              amount: '',
            },
          ])
        }
      >
        {t('添加分配', 'Add allocation')}
      </Button>
      <Input.TextArea
        className="mt20 mb16"
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t(
          '业务依据与复核说明',
          'Business evidence and review reason',
        )}
      />
      <Button
        loading={action.isPending}
        disabled={
          !reason.trim() ||
          rows.length === 0 ||
          rows.some((r) => !r.statementId || !r.transactionId || !r.amount)
        }
        onClick={() => action.mutate()}
      >
        {t('预览组合匹配', 'Preview allocations')}
      </Button>
    </>
  );
}
