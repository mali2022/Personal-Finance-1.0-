import { Drawer, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { interestApi } from './interestApi';
import type { Topic, TopicHistory as Entry } from './interestApi';
import { ErrorState } from '../../components/Feedback';
export function TopicHistory({ topic, topics, onClose }: { topic: Topic; topics: Topic[]; onClose: () => void }) {
  const query = useQuery({ queryKey: ['music-topic-history', topic.id], queryFn: () => interestApi.topicHistory(topic.id) });
  const describe = (input: Topic['input'] | null) => input ? <>
    <div>{input.name} · {input.artistProfile?.type === 'Band' ? '乐队 / 组合' : input.artistProfile?.type === 'Solo' ? '个人艺人' : input.kind === 'Brand' ? '品牌' : '艺人 / 乐队（未区分）'}</div>
    <div>别名：{input.artistProfile?.aliases.join('、') || '无'}</div>
    {input.artistProfile?.members.map((m, index) => <div key={index}>成员：{topics.find(t => t.id === m.artistId)?.input.name || m.artistId} · {m.role || '未填角色'} · {m.joinedOn || '未知'} — {m.leftOn || '未离开/未填'}</div>)}
    <div>备注：{input.note || '无'}</div>
  </> : '新建前无记录';
  return <Drawer title="艺人 / 品牌修改历史" open width="min(1000px, 100vw)" onClose={onClose}>
    {query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : <Table<Entry> rowKey="id" loading={query.isPending} dataSource={query.data} pagination={{ pageSize: 10 }} scroll={{ x: 650 }} columns={[
      { title: '修改时间', render: (_, row) => new Date(row.createdAt).toLocaleString('zh-CN') },
      { title: '修改前', render: (_, row) => describe(row.before) }, { title: '修改后', render: (_, row) => describe(row.after) },
    ]} />}
  </Drawer>;
}
