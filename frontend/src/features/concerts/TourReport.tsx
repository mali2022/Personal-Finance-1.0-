import { useState } from 'react';
import { concertLocalTime } from './time';
import { Alert, Button, Drawer, Empty, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { concertApi } from './api';
import type { Detail, TourReport as Report } from './api';
import { ConcertDetail } from './ConcertDetail';
import { Money } from '../../components/Money';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { Currency } from '../../types';
export function TourReport({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({ queryKey: ['concert', 'tour-report', id], queryFn: () => concertApi.tourReport(id) });
  const [selected, setSelected] = useState<string>();
  const hidden = useUI(s => s.hidden);
  const money = (amount: string, currency: string) => <Money value={amount} currency={currency as Currency} />;
  return <Drawer title="巡演成本与场次明细" open width="min(1200px, 100vw)" onClose={onClose}>
    {query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : <Space direction="vertical" style={{ width: '100%' }}>
      <Alert type="info" message={query.data?.rule || '正在加载巡演报表'} />
      {query.data && <Sensitive>{query.data.input.name} · {query.data.input.artist}</Sensitive>}
      <Table<Report['currencies'][number]> rowKey="currency" loading={query.isPending} dataSource={query.data?.currencies} pagination={false} scroll={{ x: 1100 }} locale={{ emptyText: <Empty description="暂无关联场次，编辑场次并选择此巡演后可查看成本。" /> }} columns={[
        { title: '币种', dataIndex: 'currency' }, { title: '场次数', dataIndex: 'count' }, { title: '已观演', dataIndex: 'attended' },
        { title: '转让净回收', render: (_, row) => row.transferRecovery == null ? '—' : money(row.transferRecovery, row.currency) },
        { title: '回收后净负担', render: (_, row) => row.personalAfterTransfers == null ? '—' : money(row.personalAfterTransfers, row.currency) },
        ...([{ key: 'totalBudget', label: '场次预算合计' }, { key: 'originalCosts', label: '已确认费用' }, { key: 'confirmedRefunds', label: '已核实退款' }, { key: 'actual', label: '全场净费用' }, { key: 'personalNetCost', label: '个人自担成本' }, { key: 'pendingAdvances', label: '待收代付款' }, { key: 'planned', label: '未发生计划' }, { key: 'remaining', label: '预算剩余' }] as const).map(field => ({ title: field.label, render: (_: unknown, row: Report['currencies'][number]) => money(row[field.key], row.currency) })),
        { title: '最终净负担（含理赔）', render: (_, row) => row.finalPersonalCost != null ? money(row.finalPersonalCost, row.currency) : '—' },
        { title: '待付他人本金', render: (_, row) => row.pendingPayables != null ? money(row.pendingPayables,row.currency) : '—' },
      ]} />
      <Table<Detail> rowKey="id" loading={query.isPending} dataSource={query.data?.scenes} pagination={{ pageSize: 20 }} scroll={{ x: 900 }} columns={[
        { title: '场次 / 城市', render: (_, scene) => <Sensitive>{scene.input.title} / {scene.input.city}</Sensitive> },
        { title: '币种', render: (_, scene) => scene.input.currency },
        { title: '当地开始时间', render: (_, scene) => concertLocalTime(scene.input) },
        { title: '全场净费用', render: (_, scene) => money(scene.report.actual, scene.input.currency) },
        { title: '个人自担成本', render: (_, scene) => money(scene.report.personalNetCost, scene.input.currency) },
        { title: '待收代付款', render: (_, scene) => money(scene.report.pendingAdvances, scene.input.currency) },
        { title: '核对提示', render: (_, scene) => scene.report.warnings.length ? <Alert type="warning" message={scene.report.warnings.join('；')} /> : '无' },
        { title: '明细', render: (_, scene) => <Button disabled={hidden} onClick={() => setSelected(scene.id)}>查看场次明细</Button> },
      ]} />
    </Space>}
    {selected && !hidden && <ConcertDetail id={selected} scenes={query.data?.scenes ?? []} onClose={() => setSelected(undefined)} />}
  </Drawer>;
}
