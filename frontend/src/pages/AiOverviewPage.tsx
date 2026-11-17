import {
  Alert,
  Button,
  Card,
  Empty,
  List,
  Progress,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { dashboardApi } from '../api/finance';
import { cashflowApi } from '../api/financialPlanning';
import { planningApi } from '../api/planning';
import { aiApi } from '../api/ai';
import { Money } from '../components/Money';
import Chart from '../components/Chart';
import { ErrorState } from '../components/Feedback';
import { decimal, minor } from '../utils/finance';
import { t, useLocale } from '../i18n';
import { useCopilot } from '../features/ai/copilotContext';

export default function AiOverviewPage() {
  useLocale();
  const ask = useCopilot();
  const today = dayjs().format('YYYY-MM-DD');
  const month = dayjs().format('YYYY-MM');
  const overview = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => dashboardApi.get(month),
  });
  const forecast = useQuery({
    queryKey: ['cashflow', 'ai-overview', today],
    queryFn: () =>
      cashflowApi.forecast({
        currency: 'CNY',
        start: today,
        end: dayjs().add(30, 'day').format('YYYY-MM-DD'),
        page: 1,
        pageSize: 20,
      }),
  });
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const reports = useQuery({
    queryKey: ['ai-conversations', 'reports', false, 1],
    queryFn: () => aiApi.conversations('', false, 1, 'Report'),
    enabled: settings.data?.privacy.saveHistory === true,
  });
  const tasks = useQuery({
    queryKey: ['automationRules', 1],
    queryFn: () => planningApi.automations(1),
  });
  const data = overview.data;
  const empty =
    data?.accounts.length === 0 && data?.recentTransactions.length === 0;
  const budget = data?.budget;
  const budgetTotal = minor(budget?.total ?? '0');
  const budgetUsed = minor(budget?.used ?? '0');
  const percent =
    budgetTotal > 0n ? Number((budgetUsed * 100n) / budgetTotal) : 0;
  const negative = forecast.data && minor(forecast.data.minimum) < 0n;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card className="ai-welcome">
        <Typography.Title level={2}>
          {t('你好，今天一起把财务看清楚')}
        </Typography.Title>
        <p>
          {t('当前账本：个人账本全部账户')} · {month} · CNY
        </p>
        <p>{t('首页由账本服务计算，不会自动把数据发送给模型。')}</p>
        <Space wrap>
          {['本月收支情况', '未来30天现金流', '本月预算执行'].map((q) => (
            <Button key={q} onClick={() => ask(t(q))}>
              {t(q)}
            </Button>
          ))}
        </Space>
      </Card>
      {overview.isError ? (
        <ErrorState error={overview.error} retry={() => overview.refetch()} />
      ) : overview.isPending ? (
        <Skeleton active />
      ) : empty ? (
        <Card>
          <Empty description={t('账本还没有数据，先完成第一笔记账')} />
          <Space wrap>
            <Link to="/accounts">{t('创建账户')}</Link>
            <Link to="/transactions">{t('开始记账')}</Link>
            <Link to="/import">{t('导入账单')}</Link>
          </Space>
        </Card>
      ) : (
        <>
          <section aria-label={t('财务摘要与重要提醒')}>
            <h2>{t('财务摘要与重要提醒')}</h2>
            <div className="ai-metrics">
              {(
                [
                  ['本月收入', data!.income],
                  ['本月支出', data!.expense],
                  ['本月结余', data!.surplus],
                  ['净资产', data!.netWorth],
                ] as const
              ).map(([label, value]) => (
                <Card key={label}>
                  <span>{t(label)}</span>
                  <strong>
                    <Money value={value} />
                  </strong>
                </Card>
              ))}
            </div>
            <Alert
              style={{ marginTop: 12 }}
              showIcon
              type={
                negative || (budgetTotal > 0n && budgetUsed > budgetTotal)
                  ? 'warning'
                  : 'info'
              }
              message={
                negative
                  ? t('已登记计划显示未来现金流存在缺口')
                  : budgetTotal > 0n && budgetUsed > budgetTotal
                    ? t('本月已超过预算')
                    : t('请核对未来计划与预算，预测只覆盖已登记事项')
              }
            />
          </section>
          <section aria-label={t('AI 财务洞察')}>
            <h2>{t('AI 财务洞察')}</h2>
            <div className="ai-insights">
              <Card title={t('支出变化')}>
                <p>
                  <Money
                    value={decimal(
                      minor(data!.expense) - minor(data!.previousExpense),
                    )}
                  />
                </p>
                <p>
                  {t(
                    '本月累计支出减去上月整月支出，月份未结束时不能直接判断趋势。',
                  )}
                </p>
                <Button
                  onClick={() => ask(t('分析本月支出变化并说明统计期间'))}
                >
                  {t('请 AI 解释')}
                </Button>
              </Card>
              <Card title={t('预算执行')}>
                <p>{budgetTotal > 0n ? `${percent}%` : t('尚未设置预算')}</p>
                <Link to="/ai-center/budget">{t('查看预算依据')}</Link>
              </Card>
              <Card title={t('现金流关注')}>
                <p>
                  {forecast.data ? (
                    <Money value={forecast.data.minimum} />
                  ) : (
                    t('等待预测数据')
                  )}
                </p>
                <p>{t('未来30天的最低现金余额，来自已登记计划。')}</p>
                <Link to="/ai-center/cashflow">{t('核对未来计划')}</Link>
              </Card>
            </div>
            <Typography.Text type="secondary">
              {t('洞察为确定性账本计算；点击解释后才调用 AI。')}
            </Typography.Text>
          </section>
        </>
      )}
      <Card
        title={t('未来现金流预测图')}
        extra={<Link to="/ai-center/cashflow">{t('查看详情')}</Link>}
      >
        {forecast.isError ? (
          <ErrorState error={forecast.error} retry={() => forecast.refetch()} />
        ) : forecast.isPending ? (
          <Skeleton active />
        ) : empty ? (
          <Empty description={t('创建账户并登记未来计划后查看预测')} />
        ) : (
          <>
            <Chart
              option={{
                xAxis: {
                  type: 'category',
                  data: forecast.data!.days.map((d) => d.date),
                },
                yAxis: { type: 'value' },
                series: [
                  {
                    name: t('现金余额'),
                    type: 'line',
                    data: forecast.data!.days.map((d) => Number(d.balance)),
                    areaStyle: { opacity: 0.08 },
                  },
                ],
                tooltip: { trigger: 'axis' },
                aria: { enabled: true },
              }}
            />
            <p>{t('基于已登记计划，不代表未来收入保证。')}</p>
            <details>
              <summary>{t('展开计算依据')}</summary>
              <p>{forecast.data!.assumptions}</p>
              <p>
                {t('期初余额')} <Money value={forecast.data!.opening} /> +{' '}
                {t('流入')} <Money value={forecast.data!.inflow} /> −{' '}
                {t('流出')} <Money value={forecast.data!.outflow} /> ={' '}
                {t('期末余额')} <Money value={forecast.data!.closing} />
              </p>
            </details>
          </>
        )}
      </Card>
      <Card title={t('预算执行与风险预警')}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {budgetTotal > 0n ? (
            <>
              <Progress
                percent={Math.min(100, Math.max(0, percent))}
                status={percent > 100 ? 'exception' : undefined}
              />
              <p>
                {t('已使用')} <Money value={budget!.used} /> /{' '}
                <Money value={budget!.total} />
              </p>
            </>
          ) : (
            <Empty description={t('尚未设置预算')} />
          )}
          {negative && (
            <Alert
              type="warning"
              message={t('已登记计划显示未来现金流存在缺口')}
            />
          )}
          {!!forecast.data?.unresolved.length && (
            <Alert
              type="warning"
              message={t('部分计划缺少条件，请到现金流页面核对')}
            />
          )}
          <Space wrap>
            <Link to="/ai-center/budget">{t('设置预算')}</Link>
            <Link to="/ai-center/risks">{t('查看风险预警')}</Link>
          </Space>
        </Space>
      </Card>
      <Card title={t('快捷 AI 操作')}>
        <Space wrap>
          <Button onClick={() => ask(t('本月收支情况'))}>
            {t('分析收支')}
          </Button>
          <Link to="/ai-center/bookkeeping">{t('智能记账')}</Link>
          <Link to="/ai-center/reports">{t('生成财务报告')}</Link>
          <Link to="/ai-center/goals">{t('财务目标')}</Link>
        </Space>
      </Card>
      <div className="ai-insights">
        <Card
          title={t('最近 AI 报告')}
          extra={<Link to="/ai-center/reports">{t('查看全部')}</Link>}
        >
          {reports.isError ? (
            <ErrorState error={reports.error} retry={() => reports.refetch()} />
          ) : (
            <List
              loading={reports.isFetching}
              dataSource={reports.data?.items.slice(0, 5) ?? []}
              locale={{ emptyText: t('暂无 AI 报告') }}
              renderItem={(r) => (
                <List.Item>
                  <Link to={'/ai-center/copilot?conversationId=' + r.id}>
                    {r.title}
                  </Link>
                </List.Item>
              )}
            />
          )}
        </Card>
        <Card
          title={t('自动化任务')}
          extra={<Link to="/ai-center/automation">{t('查看全部')}</Link>}
        >
          {tasks.isError ? (
            <ErrorState error={tasks.error} retry={() => tasks.refetch()} />
          ) : (
            <List
              loading={tasks.isPending}
              dataSource={tasks.data?.items.slice(0, 5)}
              locale={{ emptyText: t('暂无自动化任务') }}
              renderItem={(r) => (
                <List.Item>
                  {r.name} · {t(r.state)}
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </Space>
  );
}
