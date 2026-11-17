import { useState } from 'react';
import { Button, Card, Input, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { concertApi } from './api';
import type { Tour, TourInput } from './api';
import { DataEditor } from './ConcertForms';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import { Sensitive } from '../../components/Sensitive';
import { TourReport } from './TourReport';
const states = [{ value: 'Planned', label: '计划中' }, { value: 'Active', label: '进行中' }, { value: 'Completed', label: '已结束' }, { value: 'Cancelled', label: '已取消' }];
export function TourPanel() {
  const query = useQuery({ queryKey: ['concert-tours'], queryFn: concertApi.tours });
  const cache = useQueryClient();
  const hidden = useUI(s => s.hidden);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ tour?: Tour }>();
  const [report, setReport] = useState<string>();
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  return <Card>
    <Space wrap style={{ margin: '16px 0' }}>
      <Input aria-label="搜索巡演" placeholder="搜索巡演或艺人" value={search} onChange={e => setSearch(e.target.value)} />
      <Button disabled={hidden} onClick={() => setEditing({})}>新增巡演</Button>
    </Space>
    <Table<Tour> rowKey="id" loading={query.isPending} dataSource={query.data?.filter(t => `${t.input.name} ${t.input.artist}`.toLowerCase().includes(search.toLowerCase()))} pagination={{ pageSize: 20 }} scroll={{ x: 650 }} columns={[
      { title: '巡演 / 艺人', render: (_, t) => <Sensitive>{t.input.name} / {t.input.artist}</Sensitive> },
      { title: '日期范围', render: (_, t) => `${t.input.startsOn || '未定'} — ${t.input.endsOn || '未定'}` },
      { title: '状态', render: (_, t) => states.find(s => s.value === t.input.state)?.label },
      { title: '关联场次', render: (_, tour) => <Button disabled={hidden} onClick={() => setReport(tour.id)}>成本与场次（{tour.sceneCount}）</Button> },
      { title: '操作', render: (_, tour) => <Button disabled={hidden} onClick={() => setEditing({ tour })}>编辑巡演</Button> },
    ]} />
    {editing && <DataEditor title={editing.tour ? '编辑巡演' : '新增巡演'} value={editing.tour ? { ...editing.tour.input } : { name: '', artist: '', startsOn: null, endsOn: null, state: 'Planned', note: '' }} fields={[
      { name: 'name', label: '巡演名称', required: true }, { name: 'artist', label: '艺人名称', required: true },
      { name: 'startsOn', label: '开始日期', kind: 'date' }, { name: 'endsOn', label: '结束日期', kind: 'date' },
      { name: 'state', label: '巡演状态', required: true, options: states }, { name: 'note', label: '备注', kind: 'textarea' },
    ]} onClose={() => setEditing(undefined)} onSave={async value => {
      await concertApi.saveTour(value as unknown as TourInput, editing.tour);
      await cache.invalidateQueries({ queryKey: ['concert-tours'] });
      await cache.invalidateQueries({ queryKey: ['concert', 'tour-report'] }); setEditing(undefined);
    }} />}
    {report && !hidden && <TourReport id={report} onClose={() => setReport(undefined)} />}
  </Card>;
}
