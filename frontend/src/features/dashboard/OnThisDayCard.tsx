import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Collapse, Space } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
export function OnThisDayCard() {
  useLocale();
  const [expanded, setExpanded] = useState(false);
  const hidden = useUI((s) => s.hidden);
  const q = useQuery({
    queryKey: ['on-this-day-card'],
    enabled: expanded && !hidden,
    queryFn: () =>
      apiClient
        .get<
          ApiResponse<{
            total: number;
            summaries: {
              year: number;
              currency: Currency;
              income: string;
              expense: string;
              count: number;
            }[];
          }>
        >('/reports/on-this-day', { params: { currency: 'CNY', pageSize: 1 } })
        .then((r) => r.data.data),
  });
  return (
    <Collapse
      className="dashboard-history-card"
      onChange={(keys) => setExpanded(keys.length > 0)}
      items={[
        {
          key: 'memories',
          label: (
            <span className="detail-label">
              <HistoryOutlined aria-hidden="true" />
              {tr('历史上的今日')}
            </span>
          ),
          children: (
            <>
              {hidden ? (
                <Alert message={tr('隐私模式已隐藏历史金额和消费内容')} />
              ) : q.isError ? (
                <Alert
                  type="error"
                  message={tr('历史回顾加载失败，请在详情页重试')}
                />
              ) : q.isLoading ? (
                <p>{tr('正在查询历史记录…')}</p>
              ) : !q.data?.total ? (
                <p>{tr('历史同月同日暂无记录；不能据此认定零消费。')}</p>
              ) : (
                q.data.summaries.slice(0, 3).map((s) => (
                  <p key={`${s.year}-${s.currency}`}>
                    <Space wrap>
                      {s.year} {tr('年 ·')}
                      {s.count} {tr('条记录 · 收入')}{' '}
                      <Money value={s.income} currency={s.currency} />{' '}
                      {tr('· 支出')}{' '}
                      <Money value={s.expense} currency={s.currency} />
                    </Space>
                  </p>
                ))
              )}
              <Link to="/memories/on-this-day">
                {tr('查看历史消费与原交易')}
              </Link>
            </>
          ),
        },
      ]}
    />
  );
}
