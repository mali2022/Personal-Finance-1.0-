import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { App, Button, Card, Input, Popconfirm, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cashflowApi } from '../../api/financialPlanning';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';

export default function ScenarioHistoryPanel({ id, name, version, input, initialChanges, initialExplanation, onArchived }: { id: string; name: string; version: string; onArchived: () => void; initialChanges: { sourceId: string; amount: string }[]; initialExplanation: string; input: { currency: string; start: string; end: string; accountId?: string; creditFundingAccountId?: string; includeLoanPlans?: boolean } }) {
  useLocale();
  const [changes, setChanges] = useState(JSON.stringify(initialChanges, null, 2));
  const [explanation, setExplanation] = useState(initialExplanation);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const hidden = useUI(s => s.hidden);
  const cache = useQueryClient(); const { message } = App.useApp();
  const history = useQuery({ queryKey: ['cashflow', 'history', id, page], queryFn: () => cashflowApi.calculations(id, page), retry: false });
  const run = async (action: 'save' | 'freeze' | 'archive') => {
    if (busy) return; setBusy(true);
    try {
      if (action === 'save') {
        const parsed: unknown = JSON.parse(changes);
        if (!Array.isArray(parsed) || parsed.some(x => !x || typeof x.sourceId !== 'string' || typeof x.amount !== 'string')) throw new Error('请输入来源 ID 和金额字符串组成的 JSON 数组');
        await cashflowApi.changeSources(id, parsed, explanation, version, crypto.randomUUID());
      } else if (action === 'freeze') await cashflowApi.freeze(id, input, version, crypto.randomUUID());
      else { await cashflowApi.archiveScenario(id, name, initialExplanation, version, crypto.randomUUID()); onArchived(); }
      await Promise.all(['cashflow', 'cashflowScenarios'].map(key => cache.invalidateQueries({ queryKey: [key] })));
      message.success(action === 'save' ? tr("替换假设已保存") : tr("计算结果已冻结保存"));
    } catch (error) { message.error(error instanceof Error ? error.message : tr("操作失败")); }
    finally { setBusy(false); }
  };
  return <Card title={tr("情景假设与历史计算")} className="mb16">
    {!hidden && <>
      <p>{tr("替换假设（完整列表；空数组清除替换）")}</p>
      <Input.TextArea aria-label={tr("情景来源替换")} value={changes} onChange={e => setChanges(e.target.value)} placeholder={tr("[{\"sourceId\":\"manual:来源ID\",\"amount\":\"0.00\"}]")} />
      <Input.TextArea aria-label={tr("情景假设说明")} className="mb16" value={explanation} onChange={e => setExplanation(e.target.value)} placeholder={tr("假设说明及尚未覆盖的合同因素")} maxLength={2000} />
      <Space wrap><Button disabled={busy || !explanation.trim()} onClick={() => void run('save')}>{tr("保存替换假设")}</Button><Button disabled={busy} onClick={() => void run('freeze')}>{tr("保存本次计算")}</Button><Popconfirm title={tr("归档情景并保留历史？")} onConfirm={() => run('archive')}><Button disabled={busy}>{tr("归档情景")}</Button></Popconfirm></Space>
    </>}
    {history.isError ? <ErrorState error={history.error} retry={() => history.refetch()} /> : <Table rowKey="id" scroll={{ x: 550 }} dataSource={history.data?.items} pagination={{ current: page, pageSize: 10, total: history.data?.total, onChange: setPage }} columns={[
      { title: tr("计算时间"), dataIndex: 'createdAt' },
      { title: tr("当前有效性"), render: (_, row) => row.needsRecalculation ? '来源或基准日期变化，请重新计算' : '来源未变化' },
      { title: tr("冻结期末余额"), render: (_, row) => <Money value={row.result.simulation.closing} currency={row.input.currency} /> },
    ]} />}
  </Card>;
}

