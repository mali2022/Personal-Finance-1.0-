import { CURRENCY_CODES } from '../constants/currencies';
import { Card, Collapse, Descriptions, Space, Alert, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { t, useLocale } from '../i18n';
import { Money } from './Money';
import Chart from './Chart';
import type { AiSource } from '../api/ai';
import type { Currency } from '../types';
import { useUI } from '../stores/ui';

const labels: Record<string, string> = {
  income: '收入',
  expense: '支出',
  assets: '资产',
  liabilities: '负债',
  netWorth: '净资产',
  total: '总额',
  used: '已使用',
  remaining: '剩余',
  opening: '期初余额',
  closing: '期末余额',
  minimum: '最低余额',
  inflow: '流入',
  outflow: '流出',
  availableCash: '可用现金',
  amount: '金额',
};
export function AiEvidenceCards({ sources }: { sources: AiSource[] }) {
  const locale = useLocale();
  const hidden = useUI((s) => s.hidden);
  return (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
      {sources.map((s, i) => {
        const data =
          s.data && typeof s.data === 'object' && !Array.isArray(s.data)
            ? (s.data as Record<string, unknown>)
            : {};
        const currency: Currency = CURRENCY_CODES.includes(s.currency)
          ? (s.currency as Currency)
          : 'CNY';
        const metrics = Object.entries(data).filter(
          ([key, value]) =>
            labels[key] &&
            typeof value === 'string' &&
            /^-?\d+(\.\d+)?$/.test(value),
        );
        const days = Array.isArray(data.days)
          ? (data.days as { date: string; balance: string }[])
          : [];
        const items = s.tool === 'GetTransactionDetail' && typeof data.id === 'string' ? [data] : Array.isArray(data.items)
          ? data.items
          : Array.isArray(s.data)
            ? s.data
            : [];
        const transactions =
          ['GetTransactions', 'SearchTransactions', 'GetTransactionDetail'].includes(s.tool)
            ? items
                .filter(
                  (
                    x,
                  ): x is {
                    id: string;
                    occurredAt?: string;
                    amount?: string;
                  } =>
                    !!x &&
                    typeof x === 'object' &&
                    typeof x.id === 'string' &&
                    /^[0-9a-f-]{36}$/i.test(x.id),
                )
                .slice(0, 50)
            : [];
        return (
          <Card key={i} size="small" title={t(s.tool)}>
            <Typography.Text type="secondary">
              {s.start} — {s.end} · {s.currency}
            </Typography.Text>
            {!!metrics.length && (
              <Descriptions
                style={{ marginTop: 12 }}
                column={{ xs: 1, sm: 2 }}
                items={metrics.map(([key, value]) => ({
                  key,
                  label: t(labels[key]),
                  children: (
                    <Money value={value as string} currency={currency} />
                  ),
                }))}
              />
            )}
            {!!days.length && (
              <Chart
                option={{
                  xAxis: { type: 'category', data: days.map((d) => d.date) },
                  yAxis: { type: 'value' },
                  series: [
                    { type: 'line', data: days.map((d) => Number(d.balance)) },
                  ],
                  tooltip: { trigger: 'axis' },
                  aria: { enabled: true },
                }}
              />
            )}
            {!!transactions.length && (
              <Space wrap>
                {transactions.map((row) => (
                  <Link key={row.id} to={'/transactions/' + row.id}>
                    {t('交易引用')} ·{' '}
                    {row.occurredAt?.slice(0, 10) ?? row.id.slice(0, 8)}{' '}
                    {row.amount && (
                      <Money value={row.amount} currency={currency} />
                    )}
                  </Link>
                ))}
              </Space>
            )}
            {s.truncated && (
              <Alert type="warning" message={t('明细已截断，不代表完整记录')} />
            )}
            <Collapse
              style={{ marginTop: 12 }}
              items={[
                {
                  key: 'basis',
                  label: t('展开计算依据'),
                  children: (
                    <>
                      <p>{s.scope}</p>
                      <p>
                        {t('来源：')}
                        {s.source} ·{' '}
                        {new Date(s.queriedAt).toLocaleString(locale)}
                      </p>
                      <pre
                        style={{
                          maxHeight: 360,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {hidden ? '••••' : JSON.stringify(s.data, null, 2)}
                      </pre>
                      {s.detailLink?.startsWith('/') &&
                        !s.detailLink.startsWith('//') && (
                          <Link to={s.detailLink}>{t('打开财务明细')}</Link>
                        )}
                    </>
                  ),
                },
              ]}
            />
          </Card>
        );
      })}
    </Space>
  );
}
