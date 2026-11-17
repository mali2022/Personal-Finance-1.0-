import { InterestPanel } from '../features/concerts/InterestPanel';
import { TourPanel } from '../features/concerts/TourPanel';
import { TripPanel } from '../features/concerts/TripPanel';
import { ExperiencePanel } from '../features/concerts/ExperiencePanel';
import { P1FinancePanel } from '../features/concerts/P1FinancePanel';
import { ConcertOverview } from '../features/concerts/ConcertOverview';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Empty,
  InputNumber,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { Link } from 'react-router-dom';
import { Select } from '../components/TouchSelect';
import { PageTitle } from '../components/PageTitle';
import { Money } from '../components/Money';
import { Sensitive } from '../components/Sensitive';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { currencyOptions } from '../constants/currencies';
import { t as tr, useLocale } from '../i18n';
import { concertApi } from '../features/concerts/api';
import type { Scene } from '../features/concerts/api';
import { categories, sceneStates } from '../features/concerts/labels';
import { SceneEditor } from '../features/concerts/ConcertForms';
import { ConcertDetail } from '../features/concerts/ConcertDetail';
import { concertLocalTime } from '../features/concerts/time';
import './concerts.css';

export default function ConcertsPage() {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const modules = useQuery({
    queryKey: ['optional-modules'],
    queryFn: concertApi.modules,
  });
  const enabled = modules.data?.concerts === true;
  const list = useQuery({
    queryKey: ['concerts'],
    enabled,
    queryFn: concertApi.list,
  });
  const [selected, setSelected] = useState<string>();
  const [activeTab,setActiveTab]=useState('overview');
  const [creating, setCreating] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [currency, setCurrency] = useState('CNY');
  const annual = useQuery({
    queryKey: ['concert-annual', year, currency],
    enabled,
    queryFn: () => concertApi.annual(year, currency),
  });
  const money = (value: string) => (
    <Money value={value} currency={currency as 'CNY'} />
  );
  if (modules.isError)
    return <ErrorState error={modules.error} retry={() => modules.refetch()} />;
  if (!enabled)
    return (
      <Card>
        <PageTitle>{tr('演唱会专项记账')}</PageTitle>
        <p>
          {tr(
            modules.isPending
              ? '正在加载'
              : '该模块尚未启用，请在设置的可选模块中开启。',
          )}
        </p>
        <Link to="/settings">{tr('前往设置')}</Link>
      </Card>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('演唱会专项记账')}</PageTitle>
        </div>
        <Button
          type="primary"
          disabled={hidden}
          onClick={() => setCreating(true)}
        >
          {tr('新增演唱会档案')}
        </Button>
      </div>
      <Space wrap className="mb16"><span>总览年度</span><InputNumber aria-label="总览年度" min={1900} max={9900} precision={0} value={year} onChange={v=>v&&setYear(v)}/><Select aria-label="总览原币" value={currency} options={currencyOptions()} onChange={setCurrency}/></Space>
      <Tabs
        activeKey={activeTab} onChange={setActiveTab}
        items={[
          {key:'overview',label:'兴趣总览',children:<ConcertOverview currency={currency} year={year} scenes={list.data??[]} onScene={setSelected} onTab={setActiveTab}/>},
          { key: 'tours', label: '巡演档案', children: <TourPanel /> },
          {key:'trips',label:'行程中心',children:<TripPanel scenes={list.data??[]}/>},
          {key:'experiences',label:'场馆与回忆',children:<ExperiencePanel scenes={list.data??[]}/>},
          {key:'p1-finance',label:'收藏与目标',children:<P1FinancePanel/>},
          {
            key: 'scenes',
            label: tr('演唱会档案'),
            children: list.isError ? (
              <ErrorState error={list.error} retry={() => list.refetch()} />
            ) : (
              <Card>
                <Table<Scene>
                  rowKey="id"
                  loading={list.isPending}
                  dataSource={list.data}
                  scroll={{ x: 900 }}
                  locale={{
                    emptyText: <Empty description={tr('暂无演唱会档案')} />,
                  }}
                  columns={[
                    {
                      title: tr('演出 / 艺人'),
                      render: (_, s) => (
                        <Sensitive>
                          {s.input.title} · {s.input.artist}
                        </Sensitive>
                      ),
                    },
                    {
                      title: tr('巡演'),
                      render: (_, s) => s.input.tourName || '—',
                    },
                    {
                      title: tr('日期 / 城市'),
                      render: (_, s) =>
                        `${concertLocalTime(s.input)} · ${s.input.city}`,
                    },
                    { title: tr('场馆'), render: (_, s) => s.input.venue },
                    {
                      title: tr('项目预算'),
                      render: (_, s) => (
                        <Money
                          value={s.input.totalBudget}
                          currency={s.input.currency as 'CNY'}
                        />
                      ),
                    },
                    {
                      title: tr('场次状态'),
                      render: (_, s) => (
                        <Tag>{tr(sceneStates[s.input.state])}</Tag>
                      ),
                    },
                    {
                      title: tr('操作'),
                      render: (_, s) => (
                        <Button
                          type="link"
                          disabled={hidden}
                          onClick={() => setSelected(s.id)}
                        >
                          {tr('管理档案')}
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'daily',
            label: '日常周边',
            children: <InterestPanel section="daily" />,
          },
          {
            key: 'catalog',
            label: '艺人 / 品牌',
            children: <InterestPanel section="catalog" />,
          },
          {
            key: 'collection',
            label: '商品与收藏',
            children: <InterestPanel section="collection" />,
          },
          {
            key: 'analysis',
            label: '消费分析',
            children: <InterestPanel section="analysis" />,
          },
          {
            key: 'annual',
            label: tr('年度报告'),
            children: (
              <>
                <Space className="mb16" wrap>
                  <span>{tr('年度')}</span>
                  <InputNumber
                    aria-label={tr('报告年度')}
                    min={1900}
                    max={9900}
                    precision={0}
                    value={year}
                    onChange={(v) => v && setYear(v)}
                  />
                  <Select
                    aria-label={tr('报告币种')}
                    value={currency}
                    onChange={setCurrency}
                    options={currencyOptions()}
                  />
                </Space>
                {annual.isError ? (
                  <ErrorState
                    error={annual.error}
                    retry={() => annual.refetch()}
                  />
                ) : (
                  annual.data && (
                    <>
                      <div className="concert-metrics">
                        <Card size="small">
                          {tr('年度场次')}
                          <div>
                            {annual.data.count} / {tr('已参加')}{' '}
                            {annual.data.attended}
                          </div>
                        </Card>
                        <Card size="small">
                          {tr('年度本人总成本')}
                          <div>{money(annual.data.totalCost)}</div>
                          {annual.data.totalCostAfterTransfers != null && <p>扣转让净回收后：{money(annual.data.totalCostAfterTransfers)}</p>}{annual.data.finalPersonalCost != null && <p>扣理赔后的最终净负担：{money(annual.data.finalPersonalCost)}</p>}
                        </Card>
                        <Card size="small">
                          {tr('单场平均成本')}
                          <div>{money(annual.data.average)}</div>
                        </Card>
                        <Card size="small">
                          {tr('成本最高场次')}
                          <div>
                            <Sensitive>
                              {annual.data.highest?.title || '—'}
                            </Sensitive>
                          </div>
                        </Card>
                      </div>
                      <Alert
                        className="mb16"
                        type="info"
                        message={annual.data.rule}
                      />
                      <div className="concert-report-grid">
                        <Card title={tr('艺人费用归属')}>
                          <Table
                            rowKey={(artist) => artist.key || artist.id || `name:${artist.name}`}
                            dataSource={annual.data.artists}
                            pagination={false}
                            columns={[
                              { title: tr('艺人'), dataIndex: 'name' },
                              { title: tr('关联场次'), dataIndex: 'count' },
                              {
                                title: tr('本人成本'),
                                render: (_, x) => money(x.cost),
                              },
                            ]}
                          />
                        </Card>
                        <Card title={tr('城市分布')}>
                          <Table
                            rowKey="name"
                            dataSource={annual.data.cities}
                            pagination={false}
                            columns={[
                              { title: tr('城市'), dataIndex: 'name' },
                              { title: tr('场次'), dataIndex: 'count' },
                              {
                                title: tr('本人成本'),
                                render: (_, x) => money(x.cost),
                              },
                            ]}
                          />
                        </Card>
                        <Card title={tr('年度成本趋势')}>
                          <Table
                            rowKey="month"
                            dataSource={annual.data.months}
                            pagination={false}
                            columns={[
                              { title: tr('月份'), dataIndex: 'month' },
                              {
                                title: tr('本人成本'),
                                render: (_, x) => money(x.cost),
                              },
                            ]}
                          />
                        </Card>
                        <Card title={tr('全部场次费用类别')}>
                          <Table
                            rowKey="category"
                            dataSource={annual.data.categories}
                            pagination={false}
                            columns={[
                              {
                                title: tr('类别'),
                                render: (_, x) => tr(categories[x.category]),
                              },
                              {
                                title: tr('净费用'),
                                render: (_, x) => money(x.cost),
                              },
                              {
                                title: tr('占比'),
                                render: (_, x) => `${x.share}%`,
                              },
                            ]}
                          />
                        </Card>
                      </div>
                    </>
                  )
                )}
              </>
            ),
          },
        ]}
      />
      {creating && !hidden && (
        <SceneEditor
          scenes={list.data || []}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            await cache.invalidateQueries({ queryKey: ['concerts'] });
            await cache.invalidateQueries({ queryKey: ['concert-annual'] });
          }}
        />
      )}
      {selected && !hidden && (
        <ConcertDetail
          id={selected}
          scenes={list.data || []}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
